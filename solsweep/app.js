/* SolSweep — non-custodial SPL rent reclaimer.
 *
 * Finds every empty (zero-balance) SPL token account in the connected wallet,
 * closes them in chunked transactions, and returns the locked rent to the user.
 * A configurable fee on the recovered SOL is added to the SAME transaction the
 * user approves, so the fee is fully transparent and trustless.
 *
 * 100% client side. We never see the private key — wallet signs everything.
 */

// ───────────────────────── CONFIG ──────────────────────────────────────────
const CONFIG = {
  FEE_WALLET: '75cecKX13qytPMydcMsqLwVxx24hy23WiAxo8J1Nf7g1',
  FEE_BPS: 1000,
  RPC_URLS: [
    'https://mainnet.helius-rpc.com/?api-key=5192916f-045b-4f83-b8a1-f829be7cf95b',
    'https://rpc.shyft.to?api_key=acq_TjUDju_PmaSE',
    'https://mainnet.helius-rpc.com/?api-key=8a87133f-d8ac-4169-978f-9d7dbaea8980',
    'https://solana-rpc.publicnode.com',
    'https://api.mainnet-beta.solana.com',
  ],
  CLOSES_PER_TX: 16,
  MAX_TABLE_ROWS: 12,
};
// ───────────────────────────────────────────────────────────────────────────

const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } = solanaWeb3;
const TOKEN_PROGRAM_ID      = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const LAMPORTS_PER_SOL = 1_000_000_000;

let connection = new Connection(CONFIG.RPC_URLS[0], 'confirmed');
let provider   = null;
let owner      = null;
let emptyAccounts  = [];
let totalLamports  = 0;
let totalRecovered = 0; // across this session (for share card)

const $ = (id) => document.getElementById(id);
const fmt = (lam) => (lam / LAMPORTS_PER_SOL).toFixed(6);
const shortKey = (pk) => { const s = pk.toString(); return s.slice(0,4) + '…' + s.slice(-4); };

function log(msg, cls) {
  const el = $('log');
  el.innerHTML += (cls ? `<span class="${cls}">${msg}</span>` : msg) + '\n';
  el.scrollTop = el.scrollHeight;
}

// ── Wallet providers ──────────────────────────────────────────────────────

function detectProviders() {
  return {
    Phantom:  window.phantom?.solana   ?? (window.solana?.isPhantom  ? window.solana : null),
    Solflare: window.solflare?.isSolflare ? window.solflare : null,
    Backpack: window.backpack?.isBackpack ? window.backpack : null,
  };
}

function highlightDetectedWallets() {
  const detected = detectProviders();
  if (detected.Phantom)  $('btnPhantom').classList.add('active');
  if (detected.Solflare) $('btnSolflare').classList.add('active');
  if (detected.Backpack) $('btnBackpack').classList.add('active');
}

async function connectWallet(name) {
  const detected = detectProviders();
  const p = detected[name];
  if (!p) {
    alert(`${name} wallet not detected. Install it from its official site.`);
    return;
  }
  try {
    const res = await p.connect();
    provider = p;
    owner = new PublicKey(res.publicKey.toString());

    const shortAddr = shortKey(owner);
    $('walletPill').textContent = name + ': ' + shortAddr;
    $('walletPill').style.color = 'var(--accent)';

    // hide connect buttons, show disconnect + rescan
    document.querySelectorAll('.wallet-btn').forEach(b => b.disabled = true);
    $('rescanBtn').style.display   = 'inline-block';
    $('disconnectBtn').style.display = 'inline-block';

    $('feePct').textContent = $('feePct2').textContent = (CONFIG.FEE_BPS / 100).toString();
    $('scanCard').style.display = 'block';
    await scan();
  } catch (e) {
    log('Connect failed: ' + e.message, 'err');
  }
}

function disconnect() {
  try { if (provider?.disconnect) provider.disconnect(); } catch (_) {}
  provider = owner = null;
  emptyAccounts = []; totalLamports = 0;

  $('walletPill').textContent = 'Not connected';
  $('walletPill').style.color = '';
  document.querySelectorAll('.wallet-btn').forEach(b => b.disabled = false);
  $('rescanBtn').style.display = $('disconnectBtn').style.display = 'none';
  $('scanCard').style.display = $('shareCard').style.display = 'none';
  $('log').innerHTML = '';
  highlightDetectedWallets();
}

// ── RPC helpers ───────────────────────────────────────────────────────────

async function withRetry(fn, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      const m = e.message || String(e);
      if (m.includes('429') && i < tries - 1) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
}

async function scanWithRpc(url) {
  const c = new Connection(url, 'confirmed');
  const accounts = [];
  let lamports = 0;
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const resp = await withRetry(() => c.getParsedTokenAccountsByOwner(owner, { programId }));
    for (const { pubkey, account } of resp.value) {
      const info = account.data.parsed.info;
      if (info.tokenAmount.amount === '0' && info.state !== 'frozen') {
        accounts.push({
          pubkey,
          lamports: account.lamports,
          programId,
          mint: info.mint,
        });
        lamports += account.lamports;
      }
    }
  }
  connection = c;
  return { accounts, lamports };
}

// ── Scan ──────────────────────────────────────────────────────────────────

async function scan() {
  $('log').innerHTML = '';
  log('Scanning token accounts…');
  emptyAccounts = []; totalLamports = 0;
  $('accountTableWrap').style.display = 'none';
  $('accountTableBody').innerHTML = '';
  $('shareCard').style.display = 'none';

  let ok = false;
  for (const url of CONFIG.RPC_URLS) {
    try {
      const { accounts, lamports } = await scanWithRpc(url);
      emptyAccounts  = accounts;
      totalLamports  = lamports;
      log('RPC ok: ' + url.replace(/[?&](api[-_]?key)=[^&]*/gi, '$1=***'), 'ok');
      ok = true;
      break;
    } catch (e) {
      const msg = (e.message || String(e)).slice(0, 120);
      const label = url.replace(/[?&](api[-_]?key)=[^&]*/gi, '$1=***');
      log('RPC skip (' + label + '): ' + msg, 'err');
    }
  }

  if (!ok) {
    log('', 'err');
    log('All RPCs blocked the scan (403 = free RPCs forbid this call, 429 = quota).', 'err');
    log('FIX: get a free key at https://helius.dev and paste into app.js CONFIG.RPC_URLS.', 'err');
    return;
  }

  const fee = Math.floor(totalLamports * CONFIG.FEE_BPS / 10000);
  const net = totalLamports - fee;
  $('acctCount').textContent  = emptyAccounts.length;
  $('reclaimSol').textContent = fmt(totalLamports);
  $('netSol').textContent     = fmt(net);

  if (emptyAccounts.length === 0) {
    log('No empty accounts found. Wallet is already clean. ✅', 'ok');
    $('reclaimBtn').disabled = true;
  } else {
    log(`Found ${emptyAccounts.length} empty accounts → ${fmt(totalLamports)} SOL recoverable.`, 'ok');
    $('reclaimBtn').disabled = false;
    renderAccountTable(emptyAccounts);
  }
}

// ── Account table ─────────────────────────────────────────────────────────

function renderAccountTable(accounts) {
  const tbody = $('accountTableBody');
  tbody.innerHTML = '';

  const show = accounts.slice(0, CONFIG.MAX_TABLE_ROWS);
  const rest = accounts.length - show.length;

  const tokenLabel = (programId) =>
    programId.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'Token';

  for (const a of show) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${shortKey(new PublicKey(a.mint))}</td>
      <td>${tokenLabel(a.programId)}</td>
      <td class="sol" style="text-align:right">${fmt(a.lamports)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (rest > 0) {
    const tr = document.createElement('tr');
    tr.id = 'moreRow';
    tr.innerHTML = `<td colspan="3">+ ${rest} more accounts (click to show all)</td>`;
    tr.addEventListener('click', () => {
      tr.remove();
      for (const a of accounts.slice(CONFIG.MAX_TABLE_ROWS)) {
        const r = document.createElement('tr');
        r.innerHTML = `
          <td>${shortKey(new PublicKey(a.mint))}</td>
          <td>${tokenLabel(a.programId)}</td>
          <td class="sol" style="text-align:right">${fmt(a.lamports)}</td>
        `;
        tbody.appendChild(r);
      }
    });
    tbody.appendChild(tr);
  }

  $('accountTableWrap').style.display = 'block';
}

// ── Reclaim ───────────────────────────────────────────────────────────────

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function closeAccountIx(account, destination, ownerPk, programId) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: account,     isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: ownerPk,     isSigner: true,  isWritable: false },
    ],
    data: new Uint8Array([9]),
  });
}

async function reclaim() {
  if (!emptyAccounts.length) return;
  $('reclaimBtn').disabled = true;
  const feeWallet = new PublicKey(CONFIG.FEE_WALLET);
  const batches   = chunk(emptyAccounts, CONFIG.CLOSES_PER_TX);
  let recovered   = 0;
  let closedCount = 0;

  try {
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const tx = new Transaction();

      for (const acc of batch)
        tx.add(closeAccountIx(acc.pubkey, owner, owner, acc.programId));

      const batchLamports = batch.reduce((s, a) => s + a.lamports, 0);
      const batchFee = Math.floor(batchLamports * CONFIG.FEE_BPS / 10000);
      if (batchFee > 0 && CONFIG.FEE_WALLET !== owner.toString())
        tx.add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: feeWallet, lamports: batchFee }));

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = owner;

      log(`Tx ${b + 1}/${batches.length}: closing ${batch.length} accounts…`);
      const { signature } = await provider.signAndSendTransaction(tx);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      recovered   += batchLamports;
      closedCount += batch.length;
      log(`  ✅ confirmed: ${signature.slice(0, 8)}…  (+${fmt(batchLamports)} SOL)`, 'ok');
    }

    totalRecovered += recovered;
    log(`Done. Recovered ${fmt(recovered)} SOL across ${batches.length} tx.`, 'ok');
    showShareCard(recovered, closedCount);
    await scan();
  } catch (e) {
    log('Reclaim failed: ' + (e.message || e), 'err');
    $('reclaimBtn').disabled = false;
  }
}

// ── Share card ────────────────────────────────────────────────────────────

function showShareCard(recoveredLamports, closedCount) {
  const solAmt = fmt(recoveredLamports);
  $('recoveredAmt').textContent = solAmt;
  $('closedCount').textContent  = closedCount;
  $('shareCard').style.display  = 'block';
  $('shareCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  $('tweetBtn').onclick = () => {
    const text = encodeURIComponent(
      `Just recovered ${solAmt} SOL from ${closedCount} dead token accounts using SolSweep! 🔥\n\nFree up locked rent in one click:`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };
}

// ── Wire up buttons ───────────────────────────────────────────────────────

window.addEventListener('load', () => {
  highlightDetectedWallets();

  $('btnPhantom').addEventListener('click',  () => connectWallet('Phantom'));
  $('btnSolflare').addEventListener('click', () => connectWallet('Solflare'));
  $('btnBackpack').addEventListener('click', () => connectWallet('Backpack'));
  $('rescanBtn').addEventListener('click',   scan);
  $('disconnectBtn').addEventListener('click', disconnect);
  $('reclaimBtn').addEventListener('click',  reclaim);
  $('sweepAgainBtn').addEventListener('click', () => {
    $('shareCard').style.display = 'none';
    scan();
  });

  $('feePct').textContent = $('feePct2').textContent = (CONFIG.FEE_BPS / 100).toString();
});
