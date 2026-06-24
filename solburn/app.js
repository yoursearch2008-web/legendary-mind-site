/* SolBurn — non-custodial SPL token burner + rent reclaimer.
 *
 * Finds SPL token accounts with non-zero balance (spam/airdrop tokens),
 * burns the tokens + closes the accounts in one atomic transaction per batch.
 * A flat 0.001 SOL fee per closed account goes to FEE_WALLET, in the same tx.
 *
 * 100% client side. We never see the private key — wallet signs everything.
 */

// ───────────────────────── CONFIG ──────────────────────────────────────────
const CONFIG = {
  FEE_WALLET: '75cecKX13qytPMydcMsqLwVxx24hy23WiAxo8J1Nf7g1',
  FEE_PER_ACCOUNT: 1_000_000,   // 0.001 SOL per burned+closed account
  ACCOUNTS_PER_TX: 6,           // Burn+Close is 2 ixs per account — keep tx small
  RPC_URLS: [
    'https://mainnet.helius-rpc.com/?api-key=5192916f-045b-4f83-b8a1-f829be7cf95b',
    'https://rpc.shyft.to?api_key=acq_TjUDju_PmaSE',
    'https://mainnet.helius-rpc.com/?api-key=8a87133f-d8ac-4169-978f-9d7dbaea8980',
    'https://solana-rpc.publicnode.com',
    'https://api.mainnet-beta.solana.com',
  ],
};
// ───────────────────────────────────────────────────────────────────────────

const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } = solanaWeb3;
const TOKEN_PROGRAM_ID      = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const LAMPORTS_PER_SOL = 1_000_000_000;

let connection = new Connection(CONFIG.RPC_URLS[0], 'confirmed');
let provider   = null;
let owner      = null;
let dustAccounts = [];
let totalLamports = 0;
let totalBurned   = 0;

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
  if (!p) { alert(`${name} wallet not detected. Install it from its official site.`); return; }
  try {
    const res = await p.connect();
    provider = p;
    owner = new PublicKey(res.publicKey.toString());
    $('walletPill').textContent = name + ': ' + shortKey(owner);
    $('walletPill').style.color = 'var(--accent)';
    document.querySelectorAll('.wallet-btn').forEach(b => b.disabled = true);
    $('rescanBtn').style.display = $('disconnectBtn').style.display = 'inline-block';
    $('scanCard').style.display = 'block';
    await scan();
  } catch (e) { log('Connect failed: ' + e.message, 'err'); }
}

function disconnect() {
  try { if (provider?.disconnect) provider.disconnect(); } catch (_) {}
  provider = owner = null; dustAccounts = []; totalLamports = 0;
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
      if ((e.message || '').includes('429') && i < tries - 1) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1))); continue;
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
      const amount = BigInt(info.tokenAmount.amount);
      if (amount > 0n && info.state !== 'frozen') {
        accounts.push({
          pubkey,
          lamports: account.lamports,
          programId,
          mint: new PublicKey(info.mint),
          mintStr: info.mint,
          decimals: info.tokenAmount.decimals,
          uiAmount: info.tokenAmount.uiAmountString || info.tokenAmount.uiAmount?.toString() || '?',
          rawAmount: amount,
          checked: false,
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
  dustAccounts = []; totalLamports = 0;
  $('accountTableWrap').style.display = 'none';
  $('accountTableBody').innerHTML = '';
  $('shareCard').style.display = 'none';
  $('burnBtn').disabled = true;

  let ok = false;
  for (const url of CONFIG.RPC_URLS) {
    try {
      const { accounts, lamports } = await scanWithRpc(url);
      dustAccounts = accounts; totalLamports = lamports;
      log('RPC ok: ' + url.replace(/[?&](api[-_]?key)=[^&]*/gi, '$1=***'), 'ok');
      ok = true; break;
    } catch (e) {
      const label = url.replace(/[?&](api[-_]?key)=[^&]*/gi, '$1=***');
      log('RPC skip (' + label + '): ' + (e.message || '').slice(0, 100), 'err');
    }
  }

  if (!ok) { log('All RPCs failed. Check connection.', 'err'); return; }

  $('acctCount').textContent = dustAccounts.length;
  $('reclaimSol').textContent = fmt(totalLamports);
  updateFeeDisplay();

  if (dustAccounts.length === 0) {
    log('No non-zero token accounts found. Nothing to burn.', 'ok');
    return;
  }
  log(`Found ${dustAccounts.length} non-empty token accounts.`, 'ok');
  log(`Select the spam/airdrop tokens you want to burn, then click Burn & Recover.`, 'warn-text');
  renderAccountTable();
  $('accountTableWrap').style.display = 'block';
}

// ── Account table ─────────────────────────────────────────────────────────

function renderAccountTable() {
  const tbody = $('accountTableBody');
  tbody.innerHTML = '';
  dustAccounts.forEach((acc, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" id="chk${i}" onchange="onCheck(${i}, this.checked)"></td>
      <td><span class="token-sym">${shortKey(acc.mint)}</span></td>
      <td class="amount">${acc.uiAmount}</td>
      <td class="mono">${shortKey(acc.pubkey)}</td>
      <td>${fmt(acc.lamports)}</td>
    `;
    tbody.appendChild(tr);
  });
  updateSelInfo();
}

function onCheck(i, checked) {
  dustAccounts[i].checked = checked;
  updateSelInfo();
  updateFeeDisplay();
}

function selectAll(val) {
  dustAccounts.forEach((_, i) => {
    dustAccounts[i].checked = val;
    const el = $('chk' + i);
    if (el) el.checked = val;
  });
  updateSelInfo();
  updateFeeDisplay();
}

function updateSelInfo() {
  const sel = dustAccounts.filter(a => a.checked).length;
  $('selInfo').textContent = `${sel} of ${dustAccounts.length} selected`;
  $('burnBtn').disabled = sel === 0;
}

function updateFeeDisplay() {
  const selected = dustAccounts.filter(a => a.checked);
  const lamSel   = selected.reduce((s, a) => s + a.lamports, 0);
  const fee      = selected.length * CONFIG.FEE_PER_ACCOUNT;
  const net      = lamSel - fee;
  $('feeDisp').textContent = fmt(fee);
  $('netDisp').textContent = net > 0 ? fmt(net) : '0';
  $('netSol').textContent  = net > 0 ? fmt(net) : '—';
}

// ── Burn instructions ─────────────────────────────────────────────────────

function makeBurnInstruction(tokenAccount, mint, ownerKey, rawAmount, programId) {
  // Token Program instruction 3 = Burn: [u8 tag][u64 LE amount]
  const data = new Uint8Array(9);
  data[0] = 3;
  let amt = rawAmount;
  for (let b = 0; b < 8; b++) { data[1 + b] = Number(amt & 0xffn); amt >>= 8n; }
  return new TransactionInstruction({
    keys: [
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: mint,         isSigner: false, isWritable: true },
      { pubkey: ownerKey,     isSigner: true,  isWritable: false },
    ],
    programId,
    data,
  });
}

function makeCloseInstruction(tokenAccount, destinationKey, ownerKey, programId) {
  // Token Program instruction 9 = CloseAccount
  const data = new Uint8Array(1);
  data[0] = 9;
  return new TransactionInstruction({
    keys: [
      { pubkey: tokenAccount,   isSigner: false, isWritable: true },
      { pubkey: destinationKey, isSigner: false, isWritable: true },
      { pubkey: ownerKey,       isSigner: true,  isWritable: false },
    ],
    programId,
    data,
  });
}

// ── Burn & Recover ────────────────────────────────────────────────────────

async function burnSelected() {
  const selected = dustAccounts.filter(a => a.checked);
  if (selected.length === 0) { log('Nothing selected.', 'err'); return; }

  $('burnBtn').disabled = true;
  log(`\nBurning ${selected.length} account(s)…`);

  const feeWallet = new PublicKey(CONFIG.FEE_WALLET);
  const totalFee  = selected.length * CONFIG.FEE_PER_ACCOUNT;
  let totalRecoveredThisRun = 0;

  // Chunk into batches
  for (let start = 0; start < selected.length; start += CONFIG.ACCOUNTS_PER_TX) {
    const batch = selected.slice(start, start + CONFIG.ACCOUNTS_PER_TX);
    const batchNum = Math.floor(start / CONFIG.ACCOUNTS_PER_TX) + 1;
    const totalBatches = Math.ceil(selected.length / CONFIG.ACCOUNTS_PER_TX);
    log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} accounts)…`);

    try {
      const { blockhash } = await withRetry(() => connection.getLatestBlockhash());
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner });

      // Burn + Close for each account in batch
      for (const acc of batch) {
        tx.add(makeBurnInstruction(acc.pubkey, acc.mint, owner, acc.rawAmount, acc.programId));
        tx.add(makeCloseInstruction(acc.pubkey, owner, owner, acc.programId));
      }

      // Fee instruction: flat 0.001 SOL per account (on first batch only to save on fees)
      if (start === 0 && totalFee > 0) {
        tx.add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: feeWallet, lamports: totalFee }));
        log(`Fee: ${fmt(totalFee)} SOL → fee wallet`);
      }

      const signed = await provider.signTransaction(tx);
      const sig    = await withRetry(() => connection.sendRawTransaction(signed.serialize()));
      log(`Submitted: ${sig.slice(0, 12)}…`, 'ok');

      await withRetry(() => connection.confirmTransaction(sig, 'confirmed'));
      log(`Confirmed! ✅`, 'ok');

      const batchLam = batch.reduce((s, a) => s + a.lamports, 0);
      totalRecoveredThisRun += batchLam;
      totalBurned += batch.length;

    } catch (e) {
      log(`Batch ${batchNum} failed: ${(e.message || String(e)).slice(0, 200)}`, 'err');
      if (e.message?.includes('User rejected')) { log('Transaction rejected. Stopping.', 'err'); break; }
    }

    if (start + CONFIG.ACCOUNTS_PER_TX < selected.length) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  const net = totalRecoveredThisRun - totalFee;
  log(`\nDone! Burned ${totalBurned} account(s). Recovered ≈${fmt(net > 0 ? net : totalRecoveredThisRun)} SOL.`, 'ok');

  // Show share card
  $('shareTitle').textContent = `🔥 Burned ${totalBurned} spam token${totalBurned !== 1 ? 's' : ''}!`;
  $('shareSubtitle').textContent = `Recovered ≈${fmt(totalRecoveredThisRun)} SOL from locked rent.`;
  const tweetText = encodeURIComponent(`Just burned ${totalBurned} spam tokens and recovered ${fmt(net > 0 ? net : totalRecoveredThisRun)} SOL with SolBurn!\n\nFree at soltools.fyi #Solana #DeFi`);
  $('shareTw').href = `https://twitter.com/intent/tweet?text=${tweetText}`;
  $('shareCard').style.display = 'block';

  // Rescan
  await scan();
}

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  highlightDetectedWallets();
  if (window.solana || window.phantom) {
    window.solana?.on?.('accountChanged', () => { if (owner) scan(); });
    window.phantom?.solana?.on?.('accountChanged', () => { if (owner) scan(); });
  }
});
