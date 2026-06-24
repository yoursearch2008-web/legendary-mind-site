/* SolMint — SPL Token Creator
 * Creates a new SPL token mint, mints all supply to owner, charges 0.05 SOL fee.
 * 100% client-side. Phantom signs. We never see private keys.
 */

const { Connection, PublicKey, Transaction, SystemProgram, Keypair, SYSVAR_RENT_PUBKEY,
        TransactionInstruction } = solanaWeb3;

const CONFIG = {
  FEE_WALLET: '75cecKX13qytPMydcMsqLwVxx24hy23WiAxo8J1Nf7g1',
  FEE_LAMPORTS: 50_000_000, // 0.05 SOL
  RPC: 'https://mainnet.helius-rpc.com/?api-key=5192916f-045b-4f83-b8a1-f829be7cf95b',
  // SPL Token program
  TOKEN_PROGRAM: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
};

const LAMPORTS_PER_SOL = 1_000_000_000;
const $ = (id) => document.getElementById(id);
let provider = null, owner = null;
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

// ── Wallet ────────────────────────────────────────────────────────────────

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
  $('configCard').style.display = 'block';
  step(2);
}

// ── Review ────────────────────────────────────────────────────────────────

function showReview() {
  const name    = $('tName').value.trim();
  const symbol  = $('tSymbol').value.trim().toUpperCase();
  const dec     = parseInt($('tDecimals').value) || 6;
  const supply  = parseFloat($('tSupply').value) || 1_000_000_000;
  const desc    = $('tDesc').value.trim();
  const img     = $('tImage').value.trim();

  if (!name || !symbol) { alert('Name and symbol required.'); return; }

  $('reviewContent').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:14px;margin-bottom:16px">
      <div><div style="color:var(--muted);font-size:12px">Name</div><b>${name}</b></div>
      <div><div style="color:var(--muted);font-size:12px">Symbol</div><b>${symbol}</b></div>
      <div><div style="color:var(--muted);font-size:12px">Decimals</div><b>${dec}</b></div>
      <div><div style="color:var(--muted);font-size:12px">Total supply</div><b>${supply.toLocaleString()}</b></div>
      ${desc ? `<div style="grid-column:span 2"><div style="color:var(--muted);font-size:12px">Description</div><b>${desc}</b></div>` : ''}
      ${img ? `<div style="grid-column:span 2"><div style="color:var(--muted);font-size:12px">Logo</div><img src="${img}" style="height:48px;border-radius:8px;margin-top:4px"/></div>` : ''}
    </div>
  `;
  $('configCard').style.display = 'none';
  $('reviewCard').style.display = 'block';
  step(3);
}

// ── SPL Token helpers (pure JS, no @solana/spl-token) ─────────────────────

// Instruction layouts for SPL Token program
const TOKEN_IX = {
  InitializeMint: (decimals, mintAuthority, freezeAuthority) => {
    // InitializeMint: [0] (u8 tag), decimals (u8), mint_authority (32), option (u8 + 32)
    const buf = new Uint8Array(67);
    buf[0] = 0; // InitializeMint
    buf[1] = decimals;
    mintAuthority.toBytes().forEach((b, i) => buf[2 + i] = b);
    // no freeze authority
    buf[34] = 0;
    return buf;
  },
  InitializeAccount: () => new Uint8Array([1]),
  MintTo: (amount) => {
    // MintTo: tag=7, amount (u64 LE)
    const buf = new Uint8Array(9);
    buf[0] = 7;
    const view = new DataView(buf.buffer);
    // amount as u64 LE (BigInt)
    const hi = Math.floor(amount / 0x100000000);
    const lo = amount >>> 0;
    view.setUint32(1, lo, true);
    view.setUint32(5, hi, true);
    return buf;
  },
};

async function getMinRentForMint() {
  return await connection.getMinimumBalanceForRentExemption(82); // Mint account size
}
async function getMinRentForTokenAccount() {
  return await connection.getMinimumBalanceForRentExemption(165); // TokenAccount size
}

// Derive Associated Token Account address
async function getATA(wallet, mint) {
  const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS');
  const [ata] = await PublicKey.findProgramAddress(
    [wallet.toBytes(), CONFIG.TOKEN_PROGRAM.toBytes(), mint.toBytes()],
    ATA_PROGRAM,
  );
  return ata;
}

// Create Associated Token Account instruction
function createATAIx(payer, owner, mint, ata) {
  const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS');
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer,              isSigner: true,  isWritable: true  },
      { pubkey: ata,                isSigner: false, isWritable: true  },
      { pubkey: owner,              isSigner: false, isWritable: false },
      { pubkey: mint,               isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: CONFIG.TOKEN_PROGRAM,    isSigner: false, isWritable: false },
    ],
    data: new Uint8Array(0),
  });
}

// ── Launch ────────────────────────────────────────────────────────────────

async function launch() {
  $('launchBtn').disabled = true;
  $('log').innerHTML = '';

  const name   = $('tName').value.trim();
  const symbol = $('tSymbol').value.trim().toUpperCase();
  const dec    = parseInt($('tDecimals').value) || 6;
  const supply = Math.round(parseFloat($('tSupply').value) * Math.pow(10, dec));

  try {
    log('Generating mint keypair…');
    const mintKp = Keypair.generate();
    const mint = mintKp.publicKey;
    log('Mint address: ' + mint.toString(), 'ok');

    log('Fetching rent minimums…');
    const [mintRent, ataRent] = await Promise.all([
      getMinRentForMint(), getMinRentForTokenAccount()
    ]);
    const ata = await getATA(owner, mint);

    log('Building transaction…');
    const tx = new Transaction();

    // 1. Create mint account
    tx.add(SystemProgram.createAccount({
      fromPubkey:           owner,
      newAccountPubkey:     mint,
      space:                82,
      lamports:             mintRent,
      programId:            CONFIG.TOKEN_PROGRAM,
    }));

    // 2. InitializeMint (owner as mint authority, no freeze)
    tx.add(new TransactionInstruction({
      programId: CONFIG.TOKEN_PROGRAM,
      keys: [
        { pubkey: mint,              isSigner: false, isWritable: true  },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: TOKEN_IX.InitializeMint(dec, owner),
    }));

    // 3. Create ATA for owner
    tx.add(createATAIx(owner, owner, mint, ata));

    // 4. MintTo → owner's ATA
    tx.add(new TransactionInstruction({
      programId: CONFIG.TOKEN_PROGRAM,
      keys: [
        { pubkey: mint,  isSigner: false, isWritable: true  },
        { pubkey: ata,   isSigner: false, isWritable: true  },
        { pubkey: owner, isSigner: true,  isWritable: false },
      ],
      data: TOKEN_IX.MintTo(supply),
    }));

    // 5. Service fee (skip if owner === FEE_WALLET)
    if (CONFIG.FEE_WALLET !== owner.toString()) {
      tx.add(SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey:   new PublicKey(CONFIG.FEE_WALLET),
        lamports:   CONFIG.FEE_LAMPORTS,
      }));
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;

    // Mint keypair must also sign (it's a new account)
    tx.partialSign(mintKp);

    log('Waiting for wallet approval…');
    const { signature } = await provider.signAndSendTransaction(tx);
    log('Transaction sent: ' + signature.slice(0,8) + '…');

    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    log('✅ Confirmed!', 'ok');

    // Show result
    $('reviewCard').style.display = 'none';
    $('resultCard').style.display = 'block';
    $('resultText').textContent = `${name} (${symbol}) — ${(supply / Math.pow(10, dec)).toLocaleString()} tokens minted to your wallet`;
    $('mintAddr').textContent = mint.toString();
    $('solscanLink').href = `https://solscan.io/token/${mint.toString()}`;

  } catch (e) {
    log('Error: ' + (e.message || e), 'err');
    $('launchBtn').disabled = false;
  }
}

// ── Wire up ───────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  const detected = detectProviders();
  if (detected.Phantom)  $('btnPhantom').classList.add('active');
  if (detected.Solflare) $('btnSolflare').classList.add('active');
  if (detected.Backpack) $('btnBackpack').classList.add('active');

  $('btnPhantom').addEventListener('click',  () => connectWallet('Phantom'));
  $('btnSolflare').addEventListener('click', () => connectWallet('Solflare'));
  $('btnBackpack').addEventListener('click', () => connectWallet('Backpack'));
  $('reviewBtn').addEventListener('click',   showReview);
  $('backBtn').addEventListener('click', () => {
    $('reviewCard').style.display = 'none';
    $('configCard').style.display = 'block';
    step(2);
  });
  $('launchBtn').addEventListener('click', launch);
  $('newTokenBtn').addEventListener('click', () => {
    $('resultCard').style.display = 'none';
    $('configCard').style.display = 'block';
    $('log').innerHTML = '';
    step(2);
  });

  $('tSymbol').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
});
