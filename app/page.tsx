import Link from 'next/link';
import {
  fetchHealth,
  fetchMarkets,
  fetchMLMetrics,
  fetchOnchainStatus,
} from './lib/api';

// Always render fresh so the live numbers update on every visit.
export const dynamic = 'force-dynamic';

const C = {
  bg: '#0a0e13',
  bgGradient: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(13,148,136,0.15), transparent)',
  surface: '#0f1520',
  card: '#131c28',
  cardHover: '#172030',
  border: '#1a2a3a',
  borderHover: '#243a50',
  teal: '#0d9488',
  tealBright: '#14b8a6',
  tealBg: '#042420',
  amber: '#d97706',
  amberBg: '#1c1000',
  coral: '#ea580c',
  coralBg: '#1c0a00',
  green: '#22c55e',
  red: '#ef4444',
  textPrimary: '#eef2f7',
  textSecondary: '#6b8099',
  textMuted: '#3a4f62',
};
const FS = "'DM Sans', system-ui, sans-serif";
const FD = "'Inter', system-ui, sans-serif";

// ---------- Reusable primitives ----------

function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block' }} />;
}

function Pill({ children, color = C.teal }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 999,
        background: color + '14',
        border: `0.5px solid ${color}44`,
        color,
        fontSize: 11,
        fontFamily: FS,
        fontWeight: 500,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

function StatBlock({ label, value, sublabel, color }: { label: string; value: string; sublabel?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div
        style={{
          fontSize: 11,
          color: C.textMuted,
          fontFamily: FS,
          letterSpacing: '0.08em',
          fontWeight: 500,
          marginBottom: 8,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 600,
          color: color ?? C.textPrimary,
          fontFamily: FD,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sublabel && <div style={{ fontSize: 12, color: C.textSecondary, fontFamily: FS, marginTop: 4 }}>{sublabel}</div>}
    </div>
  );
}

// ---------- Page ----------

export default async function LandingPage() {
  const [health, onchain, ml, markets] = await Promise.all([
    fetchHealth(),
    fetchOnchainStatus(),
    fetchMLMetrics(),
    fetchMarkets(8),
  ]);

  const programsDeployed =
    (onchain?.programs.vault.deployed ? 1 : 0) + (onchain?.programs.ppn.deployed ? 1 : 0);
  const precisionPct = ml ? (ml.metrics.classifier_precision * 100).toFixed(2) + '%' : 'n/a';
  const walkforwardDelta = ml ? `+${(ml.metrics.walkforward_mean_improvement * 100).toFixed(2)}%` : 'n/a';
  const polymarketCount = markets ? markets.count : 0;

  return (
    <div style={{ background: C.bg, color: C.textPrimary, minHeight: '100vh', fontFamily: FS, overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: ${C.bg}; }
        a { color: inherit; }
        .cta-primary:hover { background: ${C.tealBright} !important; transform: translateY(-1px); }
        .cta-ghost:hover  { border-color: ${C.borderHover} !important; color: ${C.textPrimary} !important; }
        .feature-card:hover { border-color: ${C.borderHover} !important; background: ${C.cardHover} !important; transform: translateY(-2px); }
        .tier-card:hover { transform: translateY(-2px); }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-text {
          background: linear-gradient(90deg, ${C.textPrimary} 0%, ${C.teal} 50%, ${C.textPrimary} 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 6s ease-in-out infinite;
        }
      `}</style>

      {/* Ambient gradient glow behind hero */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 900,
          background: C.bgGradient,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ===================== NAV ===================== */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(10, 14, 19, 0.72)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: `0.5px solid ${C.border}`,
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '16px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/senthos_full.png" alt="Senthos" style={{ width: 34, height: 34 }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, fontFamily: FD, letterSpacing: '0.1em' }}>
                SENTHOS
              </div>
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: '0.08em' }}>STRUCTURED PREDICTIONS</div>
            </div>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontFamily: FS }}>
            <Link
              href="/app"
              className="cta-primary"
              style={{
                padding: '10px 22px',
                borderRadius: 10,
                background: C.teal,
                color: '#001a16',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: FD,
                textDecoration: 'none',
                transition: 'all 0.18s cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              Launch App →
            </Link>
          </div>
        </div>
      </nav>

      {/* ===================== HERO ===================== */}
      <section
        style={{
          position: 'relative',
          maxWidth: 1280,
          margin: '0 auto',
          padding: '120px 32px 80px',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <Pill color={C.teal}>
            <Dot color={C.green} /> Solana devnet · {programsDeployed}/2 programs deployed
          </Pill>
        </div>

        <h1
          style={{
            fontSize: 'clamp(48px, 7vw, 84px)',
            fontWeight: 700,
            fontFamily: FD,
            lineHeight: 1.02,
            letterSpacing: '-0.035em',
            color: C.textPrimary,
            marginBottom: 28,
          }}
        >
          Structured predictions.<br />
          <span className="shimmer-text">Priced by the market.</span>
        </h1>

        <p
          style={{
            fontSize: 'clamp(16px, 1.4vw, 19px)',
            color: C.textSecondary,
            lineHeight: 1.6,
            maxWidth: 720,
            margin: '0 auto 42px',
            fontFamily: FS,
          }}
        >
          Senthos bundles the highest-liquidity prediction markets into a single token. Choose a risk tier, deposit USDC,
          and hold a basket that auto-redeems at resolution. On-chain, non-custodial, and audited end to end.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 80 }}>
          <Link
            href="/app"
            className="cta-primary"
            style={{
              padding: '16px 32px',
              borderRadius: 12,
              background: C.teal,
              color: '#001a16',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: FD,
              textDecoration: 'none',
              transition: 'all 0.18s cubic-bezier(0.32, 0.72, 0, 1)',
              boxShadow: `0 8px 24px -8px ${C.teal}66`,
            }}
          >
            Launch App →
          </Link>
          <a
            href="http://localhost:3002"
            target="_blank"
            rel="noreferrer"
            className="cta-ghost"
            style={{
              padding: '16px 28px',
              borderRadius: 12,
              background: 'transparent',
              color: C.textSecondary,
              border: `0.5px solid ${C.border}`,
              fontSize: 15,
              fontWeight: 500,
              fontFamily: FD,
              textDecoration: 'none',
              transition: 'all 0.18s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            Protocol monitor ↗
          </a>
        </div>

        {/* Stats strip (from backend) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 24,
            padding: '32px 40px',
            background: C.card,
            border: `0.5px solid ${C.border}`,
            borderRadius: 20,
            maxWidth: 1100,
            margin: '0 auto',
            textAlign: 'left',
          }}
        >
          <StatBlock label="Programs on devnet" value={`${programsDeployed}/2`} sublabel="traxis_vault, traxis_ppn" color={C.teal} />
          <StatBlock label="Classifier precision" value={precisionPct} sublabel="audited walk-forward" color={C.amber} />
          <StatBlock label="Walk-forward Δ" value={walkforwardDelta} sublabel="vs. uniform baseline" color={C.green} />
          <StatBlock
            label="Polymarket feed"
            value={polymarketCount.toString()}
            sublabel="markets via proxy"
            color={C.coral}
          />
        </div>
      </section>

      {/* ===================== THREE VALUE PROPS ===================== */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '60px 32px 40px', position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Pill color={C.amber}>01 · Products</Pill>
          <h2
            style={{
              fontSize: 'clamp(32px, 4vw, 48px)',
              fontWeight: 700,
              fontFamily: FD,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              marginTop: 20,
              marginBottom: 14,
            }}
          >
            Three ways to take a view.
          </h2>
          <p style={{ fontSize: 16, color: C.textSecondary, maxWidth: 640, margin: '0 auto' }}>
            Backed by a correlation model with {precisionPct} classifier precision and executed by audited Anchor programs on Solana.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {[
            {
              title: 'STHS Baskets',
              tag: 'token',
              body: 'Tokenised bundles of 10+ Polymarket positions in a single tradeable STHS token. Trade freely on Jupiter; auto-redeem at resolution.',
              color: C.teal,
              bullet: ['Non-custodial', 'Exits any time', 'Fractional payouts'],
            },
            {
              title: 'Principal Protected Notes',
              tag: 'vault',
              body: 'Park principal in a Meteora yield vault; only accrued yield is deployed into the basket. Downside floor at your deposit amount.',
              color: C.amber,
              bullet: ['Principal floor', 'Meteora APY', 'Time-boxed'],
            },
            {
              title: 'Correlation Model',
              tag: 'model',
              body: `Machine-learning audit of leg correlations. ${precisionPct} classifier precision, p-value ${ml?.metrics.walkforward_p_value.toExponential(1) ?? 'n/a'}. Powering basket construction.`,
              color: C.coral,
              bullet: ['Walk-forward tested', 'Monte-Carlo VaR', 'Reproducible'],
            },
          ].map((card) => (
            <div
              key={card.title}
              className="feature-card"
              style={{
                background: C.card,
                border: `0.5px solid ${C.border}`,
                borderTop: `2px solid ${card.color}`,
                borderRadius: 16,
                padding: '28px 26px',
                transition: 'all 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              <div style={{ marginBottom: 18 }}>
                <Pill color={card.color}>{card.tag}</Pill>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: FD, letterSpacing: '-0.01em', marginBottom: 10 }}>
                {card.title}
              </div>
              <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, marginBottom: 20 }}>{card.body}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {card.bullet.map((b) => (
                  <span
                    key={b}
                    style={{
                      fontSize: 11,
                      color: C.textMuted,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: C.surface,
                      border: `0.5px solid ${C.border}`,
                      fontFamily: FS,
                    }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 32px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Pill color={C.teal}>02 · How it works</Pill>
          <h2
            style={{
              fontSize: 'clamp(32px, 4vw, 48px)',
              fontWeight: 700,
              fontFamily: FD,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              marginTop: 20,
              marginBottom: 14,
            }}
          >
            One deposit. End-to-end on-chain.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {[
            {
              n: '01',
              title: 'Pick a tier and deposit',
              body: 'Choose a 90/70/50 risk tier and deposit USDC. Your funds buy the underlying Polymarket positions. A 0.5% structuring fee goes to the treasury at issuance.',
              color: C.teal,
            },
            {
              n: '02',
              title: 'Receive an STHS token',
              body: 'An STHS basket token lands in your wallet. It tracks the weighted NAV in real time and trades freely on Jupiter. Exit any time.',
              color: C.amber,
            },
            {
              n: '03',
              title: 'Collect at resolution',
              body: 'Every leg resolves on-chain. When the bundle finalises, the vault mints pro-rata USDC into your wallet. No claim step. No manual anything.',
              color: C.coral,
            },
          ].map((s) => (
            <div
              key={s.n}
              style={{
                background: C.card,
                border: `0.5px solid ${C.border}`,
                borderRadius: 16,
                padding: '28px 26px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: s.color,
                  fontFamily: FD,
                  opacity: 0.25,
                  letterSpacing: '-0.02em',
                  marginBottom: 20,
                }}
              >
                {s.n}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: FD, marginBottom: 10, letterSpacing: '-0.01em' }}>
                {s.title}
              </div>
              <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.65 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== RISK TIERS ===================== */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 32px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Pill color={C.amber}>03 · Risk tiers</Pill>
          <h2
            style={{
              fontSize: 'clamp(32px, 4vw, 48px)',
              fontWeight: 700,
              fontFamily: FD,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              marginTop: 20,
              marginBottom: 14,
            }}
          >
            Pick your conviction.
          </h2>
          <p style={{ fontSize: 16, color: C.textSecondary, maxWidth: 640, margin: '0 auto' }}>
            Every basket averages toward a target implied probability. Higher-tier baskets have tighter floor prices; lower-tier baskets have bigger upside.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {[
            { tier: 90, label: 'Conservative', color: C.teal, price: '0.90', desc: 'High-probability basket averaging ~90% implied probability. Minimal downside, modest upside.' },
            { tier: 70, label: 'Balanced', color: C.amber, price: '0.70', desc: 'Medium-conviction basket averaging ~70% probability. Wider outcome range, meaningful upside.' },
            { tier: 50, label: 'High conviction', color: C.coral, price: '0.50', desc: 'Near even-odds basket. Maximum payout potential for strong directional views.' },
          ].map((t) => (
            <div
              key={t.tier}
              className="tier-card"
              style={{
                background: C.card,
                border: `0.5px solid ${C.border}`,
                borderTop: `2px solid ${t.color}`,
                borderRadius: 16,
                padding: '28px 26px',
                transition: 'transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 700,
                    color: t.color,
                    fontFamily: FD,
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {t.tier}%
                </div>
                <Pill color={t.color}>{t.label}</Pill>
              </div>
              <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.65, marginBottom: 22 }}>{t.desc}</p>
              <div style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: FS }}>
                  <span style={{ color: C.textMuted }}>Issue price</span>
                  <span style={{ color: t.color, fontFamily: FD, fontWeight: 500 }}>${t.price}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: FS }}>
                  <span style={{ color: C.textMuted }}>Max payout</span>
                  <span style={{ color: C.green, fontFamily: FD, fontWeight: 500 }}>$1.00 / token</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== ON-CHAIN PROOF ===================== */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 32px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Pill color={C.green}>04 · Verifiable</Pill>
          <h2
            style={{
              fontSize: 'clamp(32px, 4vw, 48px)',
              fontWeight: 700,
              fontFamily: FD,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              marginTop: 20,
              marginBottom: 14,
            }}
          >
            On-chain. Non-custodial. Right now.
          </h2>
          <p style={{ fontSize: 16, color: C.textSecondary, maxWidth: 640, margin: '0 auto' }}>
            Two Anchor programs handle deposits, leg resolution, finalisation, and redemption. Your USDC never touches a custodial wallet. The vault PDA holds it and releases at maturity.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
          {onchain ? (
            [onchain.programs.vault, onchain.programs.ppn].map((p) => (
              <div
                key={p.program_id}
                style={{
                  background: C.card,
                  border: `0.5px solid ${C.border}`,
                  borderRadius: 16,
                  padding: '26px 26px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 14, fontFamily: FD, fontWeight: 600 }}>{p.name}</span>
                  <Pill color={p.deployed && p.executable ? C.green : C.red}>
                    <Dot color={p.deployed && p.executable ? C.green : C.red} /> {p.deployed ? 'Deployed' : 'Not deployed'}
                  </Pill>
                </div>
                <div
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 12,
                    color: C.textMuted,
                    background: C.bg,
                    border: `0.5px solid ${C.border}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    wordBreak: 'break-all',
                    marginBottom: 14,
                  }}
                >
                  {p.program_id}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.textSecondary }}>
                  <span>Owner: BPF Upgradeable Loader</span>
                  <a
                    href={`https://explorer.solana.com/address/${p.program_id}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: C.teal, textDecoration: 'none', fontFamily: FD, fontWeight: 500 }}
                  >
                    View on Explorer ↗
                  </a>
                </div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: 'span 2', color: C.red, padding: 24 }}>Unable to reach the backend. Make sure it&apos;s running on port 3001.</div>
          )}
        </div>

        {/* Backend status row */}
        <div
          style={{
            marginTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 24px',
            background: C.surface,
            border: `0.5px solid ${C.border}`,
            borderRadius: 14,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSecondary }}>
              <Dot color={health?.services.polymarket.status === 'ok' ? C.green : C.red} />
              Polymarket {health?.services.polymarket.status ?? 'unknown'}
              {health?.services.polymarket.latency_ms ? ` · ${health.services.polymarket.latency_ms} ms` : ''}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSecondary }}>
              <Dot color={health?.services.supabase.status === 'ok' ? C.green : C.amber} />
              Supabase {health?.services.supabase.status ?? 'unknown'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSecondary }}>
              <Dot color={onchain ? C.green : C.red} />
              {onchain ? `Devnet slot ${onchain.slot?.toLocaleString() ?? '?'}` : 'Devnet offline'}
            </span>
          </div>
          <a
            href="http://localhost:3002"
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 13,
              color: C.teal,
              textDecoration: 'none',
              fontFamily: FD,
              fontWeight: 500,
            }}
          >
            Open protocol monitor ↗
          </a>
        </div>
      </section>

      {/* ===================== FINAL CTA ===================== */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '100px 32px 80px' }}>
        <div
          style={{
            background: `linear-gradient(135deg, ${C.tealBg} 0%, ${C.card} 60%)`,
            border: `0.5px solid ${C.teal}55`,
            borderRadius: 24,
            padding: '64px 48px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative ring */}
          <div
            style={{
              position: 'absolute',
              top: -120,
              right: -120,
              width: 360,
              height: 360,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${C.teal}22 0%, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />
          <h2
            style={{
              fontSize: 'clamp(34px, 4.2vw, 52px)',
              fontWeight: 700,
              fontFamily: FD,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              marginBottom: 18,
            }}
          >
            Ready to take a view?
          </h2>
          <p style={{ fontSize: 16, color: C.textSecondary, maxWidth: 560, margin: '0 auto 36px', lineHeight: 1.6 }}>
            $10,000 of sandbox USDC on first visit. Deposit, redeem, reset at any time. No wallet required to explore.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href="/app"
              className="cta-primary"
              style={{
                padding: '16px 32px',
                borderRadius: 12,
                background: C.teal,
                color: '#001a16',
                fontSize: 15,
                fontWeight: 600,
                fontFamily: FD,
                textDecoration: 'none',
                transition: 'all 0.18s cubic-bezier(0.32, 0.72, 0, 1)',
                boxShadow: `0 8px 24px -8px ${C.teal}88`,
              }}
            >
              Launch App →
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer style={{ borderTop: `0.5px solid ${C.border}`, background: C.surface }}>
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '40px 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/senthos_full.png" alt="Senthos" style={{ width: 28, height: 28 }} />
            <span style={{ fontSize: 13, fontFamily: FD, fontWeight: 600, letterSpacing: '0.08em' }}>SENTHOS</span>
            <span style={{ fontSize: 12, color: C.textMuted }}>© 2026 · Built for SCBC Hackathon 2026</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13, color: C.textSecondary }}>
            <Link href="/app" style={{ textDecoration: 'none' }}>App</Link>
            <a
              href="https://explorer.solana.com/address/E77R7yqUEAWz9jUk92kSnrpvUBEwGpPT3iZaThbKQcJb?cluster=devnet"
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              Vault on Explorer ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
