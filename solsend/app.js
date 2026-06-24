/* SolSend — Bulk SOL Sender
 * Sends SOL to many addresses in one session. 15 recipients/tx max.
 * Service fee: 0.001 SOL/recipient (min 0.005 SOL).
 * 100% client-side. Phantom signs. We never see private keys.
 */

const { Connection, PublicKey, Transaction, SystemProgram } = solanaWeb3;

const CONFIG = {
  FEE_WALLET:      '75cecKX13qytPMydcMsqLwVxx24hy23WiAxo8J1Nf7g1',
  FEE_PER_RECIP:   1_000_000,   // 0.001 SOL
  FEE_MIN:         5_000_000,   // 0.005 SOL minimum
  RECIPS_PER_TX:   15,
  RPC: 'https://mainnet.helius-rpc.com/?api-key=5192916f-045b-4f83-b8a1-f829be7cf95b',
};

const LAMPORTS = 1_000_000_000;
const $ = id => document.getElementById(id);
let provider = null, owner = null;
let parsedRecipients = [];

const connection = new Connection(CONFIG.RPC, 'confirmed');

function log(msg, cls) {
  const el = $('log');
  if (!el) return;
  el.innerHTML += (cls ? `<span class="${cls}">${msg}</span>` : msg) + '\n';
  el.scrollTop = el.scrollHeight;
}

function step(n) {
  [1,2,3].forEach(i => {
    const el = $(`s${i}`);
    if (!el) return;
    el.className = 'step ' + (i < n ? 'done' : i === n ? 'active' : '');
  });
}

// ── Wallet ──────────────────────────────────────────────────────────────────

function detectProviders() {
  return {
    Phantom:  window.phantom?.solana   ?? (window.solana?.isPhantom ? window.solana : null),
    Solflare: window.solflare?.isSolflare ? window.solflare : null,
    Backpack: window.backpack?.isBackpack ? window.backpack : null,
  };
}

async function connectWallet(name) {
  const p = detectProviders()[name];
  if (!p) { alert(`${name} not detected.`); return; }
  const res = await p.connect();
  provider = p;
  owner = new PublicKey(res.publicKey.toString());
  const s = owner.toString();
  $('walletPill').textContent = name + ': ' + s.slice(0,4) + '…' + s.slice(-4);
  $('walletPill').style.color = 'var(--accent)';
  document.querySelectorAll('#connectCard button').forEach(b => b.disabled = true);
  $('inputCard').style.display = 'block';
  step(2);
}

// ── Parse ───────────────────────────────────────────────────────────────────

function parseRecipients(raw) {
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  for (const line of lines) {
    // Support: comma, tab, or space separator
    const parts = line.split(/[,\t]/).map(p => p.trim());
    let addr, amt;
    if (parts.length >= 2) {
      [addr, amt] = parts;
    } else {
      // space-separated: last token is amount
      const sp = line.trim().split(/\s+/);
      amt = sp.pop();
      addr = sp.join('');
    }
    const amount = parseFloat(amt);
    let err = null;
    if (!addr || addr.length < 32) err = 'Invalid address';
    else if (isNaN(amount) || amount <= 0) err = 'Invalid amount';
    else {
      try { new PublicKey(addr); } catch { err = 'Bad public key'; }
    }
    results.push({ addr: addr || '', amount: isNaN(amount) ? 0 : amount, err });
  }
  return results;
}

function renderPreview(recips) {
  const body = $('previewBody');
  body.innerHTML = '';
  let validCount = 0, totalSol = 0;
  const errors = [];

  recips.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.err) {
      tr.className = 'err-row';
      tr.innerHTML = `<td>${i+1}</td><td colspan="2" class="addr">${r.addr || '—'}</td><td class="err">${r.err}</td>`;
      errors.push(`Row ${i+1}: ${r.err}`);
    } else {
      const short = r.addr.slice(0,4) + '…' + r.addr.slice(-4);
      tr.innerHTML = `<td>${i+1}</td><td class="addr">${short}</td><td class="amt">${r.amount.toFixed(4)}</td><td>✓</td>`;
      validCount++;
      totalSol += r.amount;
    }
    body.appendChild(tr);
  });

  const fee = Math.max(CONFIG.FEE_MIN, validCount * CONFIG.FEE_PER_RECIP) / LAMPORTS;
  const txCount = Math.ceil(validCount / CONFIG.RECIPS_PER_TX);

  $('recipientCount').textContent = validCount + ' valid';
  $('feeCount').textContent = validCount;
  $('feeTotal').textContent = totalSol.toFixed(4) + ' SOL';
  $('feeSvc').textContent = fee.toFixed(4) + ' SOL';
  $('feeTx').textContent = `~${(txCount * 0.000005).toFixed(6)} SOL (${txCount} tx)`;
  $('feeGrand').textContent = (totalSol + fee + txCount * 0.000005).toFixed(4) + ' SOL';

  const errDiv = $('errorList');
  errDiv.innerHTML = errors.length
    ? `<div class="err" style="font-size:12px">${errors.map(e=>`⚠ ${e}`).join('<br>')}</div>`
    : '';

  $('preview').style.display = 'block';
  return { validCount, totalSol, fee, txCount };
}

// ── Send ─────────────────────────────────────────────────────────────────────

async function send() {
  $('sendBtn').disabled = true;
  $('log').innerHTML = '';

  const valid = parsedRecipients.filter(r => !r.err);
  const chunks = [];
  for (let i = 0; i < valid.length; i += CONFIG.RECIPS_PER_TX) {
    chunks.push(valid.slice(i, i + CONFIG.RECIPS_PER_TX));
  }

  const totalFee = Math.max(CONFIG.FEE_MIN, valid.length * CONFIG.FEE_PER_RECIP);
  const signatures = [];

  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      log(`\nTx ${ci+1}/${chunks.length} — ${chunk.length} recipients…`);

      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = owner;

      for (const r of chunk) {
        tx.add(SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey:   new PublicKey(r.addr),
          lamports:   Math.round(r.amount * LAMPORTS),
        }));
      }

      // Fee on first tx only
      if (ci === 0 && CONFIG.FEE_WALLET !== owner.toString()) {
        tx.add(SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey:   new PublicKey(CONFIG.FEE_WALLET),
          lamports:   totalFee,
        }));
      }

      log(`Waiting for wallet approval (tx ${ci+1})…`);
      const { signature } = await provider.signAndSendTransaction(tx);
      log(`Sent: ${signature.slice(0,8)}…`, 'ok');

      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      log(`Confirmed ✅`, 'ok');
      signatures.push(signature);
    }

    // Show result
    $('sendCard').style.display = 'none';
    $('resultCard').style.display = 'block';
    $('resultText').textContent = `Sent to ${valid.length} recipients across ${chunks.length} transaction${chunks.length>1?'s':''}.`;

    const txLinksEl = $('txLinks');
    signatures.forEach((sig, i) => {
      const a = document.createElement('a');
      a.href = `https://solscan.io/tx/${sig}`;
      a.target = '_blank';
      a.innerHTML = `<button style="width:auto;padding:10px 16px;font-size:13px">Tx ${i+1} on Solscan</button>`;
      txLinksEl.appendChild(a);
    });

  } catch (e) {
    log('Error: ' + (e.message || e), 'err');
    $('sendBtn').disabled = false;
  }
}

// ── Wire up ──────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  const detected = detectProviders();
  if (detected.Phantom)  $('btnPhantom').classList.add('active');
  if (detected.Solflare) $('btnSolflare').classList.add('active');
  if (detected.Backpack) $('btnBackpack').classList.add('active');

  $('btnPhantom').addEventListener('click',  () => connectWallet('Phantom'));
  $('btnSolflare').addEventListener('click', () => connectWallet('Solflare'));
  $('btnBackpack').addEventListener('click', () => connectWallet('Backpack'));

  // Example format buttons
  $('exCsv').addEventListener('click', () => {
    $('recipientInput').value = 'EjnFPeimFN5sYkrNGrTb2jCXbMJBisPDV1BjR2pkWTp8, 0.1\nBfJV93B6j7PxJKpEzmLkyxJdvJTbg5rCa8TuY2XnZ9q, 0.05';
  });
  $('exTab').addEventListener('click', () => {
    $('recipientInput').value = 'EjnFPeimFN5sYkrNGrTb2jCXbMJBisPDV1BjR2pkWTp8\t0.1\nBfJV93B6j7PxJKpEzmLkyxJdvJTbg5rCa8TuY2XnZ9q\t0.05';
  });
  $('exSpace').addEventListener('click', () => {
    $('recipientInput').value = 'EjnFPeimFN5sYkrNGrTb2jCXbMJBisPDV1BjR2pkWTp8 0.1\nBfJV93B6j7PxJKpEzmLkyxJdvJTbg5rCa8TuY2XnZ9q 0.05';
  });

  $('parseBtn').addEventListener('click', () => {
    const raw = $('recipientInput').value;
    if (!raw.trim()) { alert('Paste some recipients first.'); return; }
    parsedRecipients = parseRecipients(raw);
    const { validCount, totalSol, fee } = renderPreview(parsedRecipients);
    if (validCount === 0) return;

    // Build send card summary
    $('inputCard').style.display = 'none';
    $('sendCard').style.display = 'block';
    $('sendSummary').innerHTML = `
      <div class="fee-box">
        <div class="fee-row"><span class="lbl">Recipients</span><span>${validCount}</span></div>
        <div class="fee-row"><span class="lbl">Total to send</span><span>${totalSol.toFixed(4)} SOL</span></div>
        <div class="fee-row"><span class="lbl">Service fee</span><span>${fee.toFixed(4)} SOL</span></div>
        <div class="fee-row fee-total"><span class="lbl">Grand total</span><span class="val">${(totalSol+fee).toFixed(4)} SOL</span></div>
      </div>
    `;
    step(3);
  });

  $('backBtn').addEventListener('click', () => {
    $('sendCard').style.display = 'none';
    $('inputCard').style.display = 'block';
    step(2);
  });

  $('sendBtn').addEventListener('click', send);

  $('newSendBtn').addEventListener('click', () => {
    $('resultCard').style.display = 'none';
    $('inputCard').style.display = 'block';
    $('recipientInput').value = '';
    $('preview').style.display = 'none';
    parsedRecipients = [];
    step(2);
  });
});
