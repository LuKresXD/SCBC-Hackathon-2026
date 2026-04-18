"use client";
/**
 * Sandbox state container for the Senthos authenticated app shell.
 *
 * Every product primitive (Native Basket, Tranched Pool Tokens, PPN, Lending)
 * deposits and withdraws through the actions here, so the Portfolio page can
 * always produce a single consolidated view. State is in-memory per browser
 * session and resets to the seeded starting balance on `reset()` or on a hard
 * reload.
 *
 * Design:
 * - One reducer, one typed action union. No useEffect chains.
 * - Positions are never merged across primitives: each product owns its own
 *   list, and the portfolio view is the one place that fans them in.
 * - No backend calls live in here. Pages that need to hit the backend
 *   (markets, hedge analysis, etc.) do so directly and then dispatch a local
 *   action to persist the result.
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { SANDBOX_STARTING_USDC } from "./tokens";
import { BUNDLES, bundleById } from "./bundles";

// ---------- Position types ----------

export type BasketPosition = {
  bundleId: string;
  qty: number; // STHS tokens held
  avgCost: number; // avg NAV at entry
};

export type TrancheKind = "senior" | "mezzanine" | "junior";
export type TranchePosition = {
  bundleId: string;
  kind: TrancheKind;
  qty: number;
  avgCost: number;
};

export type PpnVault = {
  id: string;
  bundleId: string;
  principal: number; // USDC locked in protection sleeve
  basketAmount: number; // USDC deployed to basket
  apy: number;
  createdAt: number;
  maturityDays: number;
};

export type LendingLoan = {
  id: string;
  collateralKind: "basket" | "tranche";
  bundleId: string;
  trancheKind?: TrancheKind; // only set when collateralKind === 'tranche'
  collateralQty: number; // tokens posted
  borrowedUsdc: number;
  rateApy: number; // nominal, simple interest for sandbox
  openedAt: number;
};

export type LendingDeposit = {
  amount: number;
  startApy: number;
  startedAt: number;
};

export type SandboxState = {
  usdc: number;
  basketPositions: BasketPosition[];
  tranchePositions: TranchePosition[];
  ppnVaults: PpnVault[];
  loans: LendingLoan[];
  lend: LendingDeposit | null;
};

// ---------- Actions ----------

type Action =
  | { type: "reset" }
  | { type: "basket/deposit"; bundleId: string; usdcAmount: number }
  | { type: "basket/redeem"; bundleId: string; qty: number; payoutUsdc: number }
  | {
      type: "tranche/deposit";
      bundleId: string;
      kind: TrancheKind;
      usdcAmount: number;
      pricePerToken: number;
    }
  | { type: "ppn/open"; bundleId: string; usdcAmount: number; apy: number; maturityDays: number }
  | { type: "ppn/close"; vaultId: string; payoutUsdc: number }
  | {
      type: "lending/borrow";
      collateralKind: "basket" | "tranche";
      bundleId: string;
      trancheKind?: TrancheKind;
      collateralQty: number;
      borrowedUsdc: number;
      rateApy: number;
    }
  | { type: "lending/repay"; loanId: string; repaidUsdc: number }
  | { type: "lending/deposit"; amount: number; apy: number }
  | { type: "lending/withdraw"; amount: number };

// ---------- Reducer ----------

export const initialSandboxState: SandboxState = {
  usdc: SANDBOX_STARTING_USDC,
  basketPositions: [],
  tranchePositions: [],
  ppnVaults: [],
  loans: [],
  lend: null,
};

function reducer(state: SandboxState, action: Action): SandboxState {
  switch (action.type) {
    case "reset":
      return initialSandboxState;

    case "basket/deposit": {
      const bundle = bundleById(action.bundleId);
      if (!bundle) return state;
      if (action.usdcAmount <= 0 || action.usdcAmount > state.usdc) return state;
      const tokensReceived = (action.usdcAmount * 0.995) / bundle.nav;
      const existing = state.basketPositions.find((p) => p.bundleId === action.bundleId);
      const nextPositions = existing
        ? state.basketPositions.map((p) =>
            p.bundleId === action.bundleId
              ? {
                  bundleId: p.bundleId,
                  qty: p.qty + tokensReceived,
                  avgCost:
                    (p.qty * p.avgCost + tokensReceived * bundle.nav) /
                    (p.qty + tokensReceived),
                }
              : p,
          )
        : [
            ...state.basketPositions,
            {
              bundleId: action.bundleId,
              qty: tokensReceived,
              avgCost: bundle.nav,
            },
          ];
      return {
        ...state,
        usdc: state.usdc - action.usdcAmount,
        basketPositions: nextPositions,
      };
    }

    case "basket/redeem": {
      const pos = state.basketPositions.find((p) => p.bundleId === action.bundleId);
      if (!pos) return state;
      const nextQty = Math.max(0, pos.qty - action.qty);
      const nextPositions = nextQty === 0
        ? state.basketPositions.filter((p) => p.bundleId !== action.bundleId)
        : state.basketPositions.map((p) => (p.bundleId === action.bundleId ? { ...p, qty: nextQty } : p));
      return {
        ...state,
        usdc: state.usdc + action.payoutUsdc,
        basketPositions: nextPositions,
      };
    }

    case "tranche/deposit": {
      if (action.usdcAmount <= 0 || action.usdcAmount > state.usdc) return state;
      const tokensReceived = action.usdcAmount / action.pricePerToken;
      const key = (p: TranchePosition) =>
        p.bundleId === action.bundleId && p.kind === action.kind;
      const existing = state.tranchePositions.find(key);
      const nextPositions = existing
        ? state.tranchePositions.map((p) =>
            key(p)
              ? {
                  ...p,
                  qty: p.qty + tokensReceived,
                  avgCost:
                    (p.qty * p.avgCost + tokensReceived * action.pricePerToken) /
                    (p.qty + tokensReceived),
                }
              : p,
          )
        : [
            ...state.tranchePositions,
            {
              bundleId: action.bundleId,
              kind: action.kind,
              qty: tokensReceived,
              avgCost: action.pricePerToken,
            },
          ];
      return {
        ...state,
        usdc: state.usdc - action.usdcAmount,
        tranchePositions: nextPositions,
      };
    }

    case "ppn/open": {
      if (action.usdcAmount <= 0 || action.usdcAmount > state.usdc) return state;
      const principal = action.usdcAmount; // the whole deposit is principal-protected
      const basketAmount = action.usdcAmount * 0.07;
      const id = `PPN-${action.bundleId}-${Date.now().toString(36)}`;
      return {
        ...state,
        usdc: state.usdc - action.usdcAmount,
        ppnVaults: [
          ...state.ppnVaults,
          {
            id,
            bundleId: action.bundleId,
            principal,
            basketAmount,
            apy: action.apy,
            createdAt: Date.now(),
            maturityDays: action.maturityDays,
          },
        ],
      };
    }

    case "ppn/close": {
      const vault = state.ppnVaults.find((v) => v.id === action.vaultId);
      if (!vault) return state;
      return {
        ...state,
        usdc: state.usdc + action.payoutUsdc,
        ppnVaults: state.ppnVaults.filter((v) => v.id !== action.vaultId),
      };
    }

    case "lending/borrow": {
      return {
        ...state,
        usdc: state.usdc + action.borrowedUsdc,
        loans: [
          ...state.loans,
          {
            id: `LOAN-${Date.now().toString(36)}`,
            collateralKind: action.collateralKind,
            bundleId: action.bundleId,
            trancheKind: action.trancheKind,
            collateralQty: action.collateralQty,
            borrowedUsdc: action.borrowedUsdc,
            rateApy: action.rateApy,
            openedAt: Date.now(),
          },
        ],
      };
    }

    case "lending/repay": {
      if (action.repaidUsdc > state.usdc) return state;
      return {
        ...state,
        usdc: state.usdc - action.repaidUsdc,
        loans: state.loans.filter((l) => l.id !== action.loanId),
      };
    }

    case "lending/deposit": {
      if (action.amount <= 0 || action.amount > state.usdc) return state;
      const currentPrincipal = state.lend?.amount ?? 0;
      return {
        ...state,
        usdc: state.usdc - action.amount,
        lend: {
          amount: currentPrincipal + action.amount,
          startApy: action.apy,
          startedAt: state.lend?.startedAt ?? Date.now(),
        },
      };
    }

    case "lending/withdraw": {
      if (!state.lend || action.amount <= 0 || action.amount > state.lend.amount) return state;
      const remainingPrincipal = state.lend.amount - action.amount;
      return {
        ...state,
        usdc: state.usdc + action.amount,
        lend: remainingPrincipal > 0 ? { ...state.lend, amount: remainingPrincipal } : null,
      };
    }

    default:
      return state;
  }
}

// ---------- Context ----------

type SandboxCtx = {
  state: SandboxState;
  dispatch: React.Dispatch<Action>;
  // Convenience selectors used by several pages
  totals: {
    totalValue: number;
    basketValue: number;
    trancheValue: number;
    ppnValue: number;
    loanDebt: number;
    lendValue: number;
    unrealizedPnl: number;
  };
};

const SandboxContext = createContext<SandboxCtx | null>(null);

export function SandboxProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialSandboxState);

  const totals = useMemo(() => {
    const basketValue = state.basketPositions.reduce((s, p) => {
      const b = bundleById(p.bundleId);
      return s + (b ? p.qty * b.nav : 0);
    }, 0);
    const trancheValue = state.tranchePositions.reduce((s, p) => s + p.qty * p.avgCost, 0);
    const ppnValue = state.ppnVaults.reduce((s, v) => s + v.principal, 0);
    const loanDebt = state.loans.reduce((s, l) => s + l.borrowedUsdc, 0);
    const lendValue = state.lend?.amount ?? 0;
    const unrealizedPnl = state.basketPositions.reduce((s, p) => {
      const b = bundleById(p.bundleId);
      return s + (b ? p.qty * (b.nav - p.avgCost) : 0);
    }, 0);
    const totalValue =
      state.usdc + basketValue + trancheValue + ppnValue + lendValue - loanDebt;
    return {
      totalValue,
      basketValue,
      trancheValue,
      ppnValue,
      loanDebt,
      lendValue,
      unrealizedPnl,
    };
  }, [state]);

  const ctx = useMemo<SandboxCtx>(() => ({ state, dispatch, totals }), [state, totals]);
  return <SandboxContext.Provider value={ctx}>{children}</SandboxContext.Provider>;
}

export function useSandbox(): SandboxCtx {
  const ctx = useContext(SandboxContext);
  if (!ctx) throw new Error("useSandbox must be used inside <SandboxProvider>");
  return ctx;
}

export { BUNDLES };
