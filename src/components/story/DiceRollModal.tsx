import { useState } from "react";

export type DiceRollResult = {
  stat: string;
  modifier: number;
  dice: [number, number];
  total: number;
  outcome: "CRITICAL SUCCESS" | "SUCCESS" | "FAILURE" | "CRITICAL FAILURE";
};

interface Props {
  stat: string;
  modifier: number;
  actionText: string;
  onConfirm: (result: DiceRollResult) => void;
  onCancel: () => void;
}

const STAT_LABELS: Record<string, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
};

function modifierLabel(mod: number): string {
  if (mod > 0) return `+${mod}`;
  if (mod < 0) return `${mod}`;
  return "±0";
}

export function DiceRollModal({ stat, modifier, actionText, onConfirm, onCancel }: Props) {
  const [rolled, setRolled] = useState<DiceRollResult | null>(null);

  function roll() {
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const naturalTotal = die1 + die2;
    const total = naturalTotal + modifier;
    const isCritSuccess = die1 === 6 && die2 === 6;
    const isCritFailure = die1 === 1 && die2 === 1;
    const outcome: DiceRollResult["outcome"] = isCritSuccess
      ? "CRITICAL SUCCESS"
      : isCritFailure
      ? "CRITICAL FAILURE"
      : total >= 7
      ? "SUCCESS"
      : "FAILURE";
    setRolled({ stat, modifier, dice: [die1, die2], total, outcome });
  }

  const statLabel = STAT_LABELS[stat] ?? stat.toUpperCase();
  const modLabel = modifierLabel(modifier);

  const outcomeColor =
    rolled?.outcome === "CRITICAL SUCCESS"
      ? "text-yellow-400"
      : rolled?.outcome === "SUCCESS"
      ? "text-green-400"
      : rolled?.outcome === "CRITICAL FAILURE"
      ? "text-red-600"
      : "text-red-400";

  const outcomeBorder =
    rolled?.outcome === "CRITICAL SUCCESS"
      ? "border-yellow-400"
      : rolled?.outcome === "SUCCESS"
      ? "border-green-400"
      : rolled?.outcome === "CRITICAL FAILURE"
      ? "border-red-600"
      : rolled
      ? "border-red-400"
      : "border-white/20";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0">
      <div className={`w-full max-w-sm rounded-2xl border bg-zinc-900 p-6 shadow-2xl transition-colors ${outcomeBorder}`}>
        <p className="text-xs text-zinc-400 mb-1 truncate">Action</p>
        <p className="text-sm text-white mb-4 line-clamp-2">{actionText}</p>

        <div className="flex items-center justify-between mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{statLabel}</div>
            <div className="text-sm text-zinc-400">{modLabel}</div>
          </div>

          {rolled ? (
            <div className="text-center flex-1 mx-4">
              <div className="text-4xl font-bold text-white">
                {rolled.dice[0]} + {rolled.dice[1]}
              </div>
              <div className="text-xs text-zinc-400 mt-1">2d6 roll</div>
            </div>
          ) : (
            <div className="flex-1 mx-4 flex items-center justify-center">
              <div className="text-4xl">🎲</div>
            </div>
          )}

          {rolled ? (
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{rolled.total}</div>
              <div className="text-xs text-zinc-400">total</div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-2xl font-bold text-zinc-600">—</div>
              <div className="text-xs text-zinc-600">total</div>
            </div>
          )}
        </div>

        {rolled && (
          <div className={`text-center text-lg font-bold mb-5 ${outcomeColor}`}>
            {rolled.outcome}
          </div>
        )}

        {!rolled ? (
          <button
            onClick={roll}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-3 transition-colors"
          >
            Roll 2d6
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl border border-white/20 text-zinc-400 hover:text-white hover:border-white/40 font-semibold py-3 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(rolled)}
              className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-3 transition-colors"
            >
              Confirm
            </button>
          </div>
        )}

        {!rolled && (
          <button
            onClick={onCancel}
            className="w-full mt-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
