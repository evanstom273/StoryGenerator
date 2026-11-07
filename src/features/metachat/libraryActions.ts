import { openStoryEngineDatabase } from "../../lib/idb";
import { createEntityId } from "../../lib/ids";
import {
  createCharacterRecord,
  updateCharacterRecord,
  createUniverseRecord,
  updateUniverseRecord,
  characterDeletionReason,
  universeDeletionReason,
} from "../../lib/libraryRecords";
import { getUniverseIds } from "../../lib/universeIds";
import type {
  PlayerCharacter,
  PlayerCharacterDraft,
  Universe,
  UniverseDraft,
  Story,
} from "../../types/models";
import type {
  ActionResult,
  Conversation,
  LibraryAction,
  LibraryProposal,
  ProposedAction,
  ResourceCatalog,
} from "./types";
import { CONVERSATION_CONFLICT } from "./repository";

const characterFields = new Set(
  "name aliases knownTies age gender species pronouns characterConcept appearance personality background notes universeId universeIds".split(
    " ",
  ),
);
const universeFields = new Set(
  "name description wikiUrl mode concept genreTheme tone universeBlueprint notes".split(
    " ",
  ),
);
function validateDraft(
  kind: LibraryAction["kind"],
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("An action needs a structured draft.");
  const draft = value as Record<string, unknown>;
  for (const [field, item] of Object.entries(draft)) {
    if (!(kind === "character" ? characterFields : universeFields).has(field))
      throw new Error(
        `Unsupported ${kind} field: ${field}. Story canon and character roles cannot be changed.`,
      );
    if (["aliases", "knownTies", "universeIds"].includes(field)) {
      if (
        !Array.isArray(item) ||
        item.length > 100 ||
        item.some((entry) => typeof entry !== "string" || entry.length > 1000)
      )
        throw new Error(`Invalid ${field}.`);
    } else if (typeof item !== "string" || item.length > 30000)
      throw new Error(`Invalid ${field}.`);
  }
  if (draft.name !== undefined && !(draft.name as string).trim())
    throw new Error("Name cannot be empty.");
  if (
    draft.mode !== undefined &&
    !["custom", "referenced"].includes(String(draft.mode))
  )
    throw new Error("Invalid universe mode.");
  if (draft.wikiUrl) {
    let url: URL;
    try {
      url = new URL(String(draft.wikiUrl));
    } catch {
      throw new Error("Invalid wiki URL.");
    }
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("Wiki URLs must use HTTP or HTTPS.");
  }
  return draft;
}
export function prepareProposal(
  actions: LibraryAction[],
  catalog: ResourceCatalog,
): LibraryProposal {
  if (!actions.length || actions.length > 30)
    throw new Error("A proposal must contain 1–30 library actions.");
  const seen = new Set<string>();
  const proposed: ProposedAction[] = actions.map((action) => {
    if (
      !action ||
      !["character", "universe"].includes(action.kind) ||
      !["create", "update", "delete"].includes(action.operation)
    )
      throw new Error(
        "Only character and universe library operations are supported.",
      );
    if (
      typeof action.summary !== "string" ||
      !action.summary.trim() ||
      action.summary.length > 1000
    )
      throw new Error("Every action needs a reviewable description.");
    if (action.operation === "create" && action.targetId)
      throw new Error("A new record cannot overwrite an existing ID.");
    const before =
      action.kind === "character"
        ? catalog.characters.find((item) => item.id === action.targetId)
        : catalog.universes.find((item) => item.id === action.targetId);
    if (action.operation !== "create" && !before)
      throw new Error(
        `The ${action.kind} target no longer exists or is not a library record.`,
      );
    if (action.targetId) {
      const key = `${action.kind}:${action.targetId}`;
      if (seen.has(key))
        throw new Error("A proposal cannot change the same record twice.");
      seen.add(key);
    }
    if (action.operation === "delete") {
      if (action.draft && Object.keys(action.draft).length)
        throw new Error("Deletion cannot include field changes.");
      return { ...action, id: createEntityId("action"), before };
    }
    const patch = validateDraft(action.kind, action.draft);
    let after: PlayerCharacter | Universe;
    if (action.kind === "character") {
      const draft = {
        name: "",
        age: "",
        gender: "",
        species: "",
        pronouns: "",
        appearance: "",
        personality: "",
        background: "",
        notes: "",
        universeId: "",
        ...before,
        ...patch,
        scope: "library",
      } as PlayerCharacterDraft;
      if (patch.universeId !== undefined && patch.universeIds === undefined)
        draft.universeIds = [String(patch.universeId)];
      if (!draft.name.trim()) throw new Error("A character needs a name.");
      if (
        !getUniverseIds(draft).length ||
        getUniverseIds(draft).some(
          (id) => !catalog.universes.some((item) => item.id === id),
        )
      )
        throw new Error("Choose existing universes for the character.");
      after = before
        ? updateCharacterRecord(draft, before as PlayerCharacter)
        : createCharacterRecord(draft);
    } else {
      const draft = {
        name: "",
        description: "",
        wikiUrl: "",
        mode: "custom",
        ...before,
        ...patch,
      } as UniverseDraft;
      if (!draft.name.trim()) throw new Error("A universe needs a name.");
      after = before
        ? updateUniverseRecord(draft, before as Universe)
        : createUniverseRecord(draft);
    }
    return {
      ...action,
      draft: patch,
      id: createEntityId("action"),
      before,
      after,
    };
  });
  return {
    id: createEntityId("proposal"),
    status: "pending",
    actions: proposed,
  };
}

/** Preflight all actions against the resulting library before any write. */
export function validateBatch(
  proposal: LibraryProposal,
  catalog: ResourceCatalog,
): ActionResult[] {
  const errors = new Map<string, string>();
  for (const action of proposal.actions) {
    const records =
      action.kind === "character" ? catalog.characters : catalog.universes;
    const current = records.find((item) => item.id === action.targetId);
    if (
      action.operation !== "create" &&
      JSON.stringify(current) !== JSON.stringify(action.before)
    )
      errors.set(
        action.id,
        "This record changed since review. Request a fresh proposal.",
      );
    if (
      action.kind === "character" &&
      current &&
      "scope" in current &&
      current.scope === "story"
    )
      errors.set(
        action.id,
        "Story starting sheets cannot be edited by MetaChat.",
      );
  }
  for (const action of proposal.actions) {
    if (errors.has(action.id)) continue;
    try {
      const validated = prepareProposal([action], catalog).actions[0];
      if (action.operation !== "delete") {
        if (!action.after || !validated.after)
          throw new Error("The reviewed record is incomplete.");
        const {
          id: reviewedId,
          createdAt: _reviewedAt,
          ...reviewed
        } = action.after;
        const {
          id: expectedId,
          createdAt: _expectedAt,
          ...expected
        } = validated.after;
        if (
          JSON.stringify(reviewed) !== JSON.stringify(expected) ||
          (action.operation === "update" && reviewedId !== expectedId)
        )
          throw new Error(
            "The reviewed fields no longer match the validated changes.",
          );
        if (
          action.operation === "create" &&
          [...catalog.characters, ...catalog.universes].some(
            (item) => item.id === reviewedId,
          )
        )
          throw new Error("The proposed record ID already exists.");
      }
    } catch (error) {
      errors.set(
        action.id,
        error instanceof Error ? error.message : "Invalid reviewed action.",
      );
    }
  }
  const characters = [...catalog.characters];
  const universes = [...catalog.universes];
  for (const action of proposal.actions) {
    const records = action.kind === "character" ? characters : universes;
    const index = records.findIndex((item) => item.id === action.targetId);
    if (index >= 0) records.splice(index, 1);
    if (action.after)
      (records as Array<PlayerCharacter | Universe>).push(action.after);
  }
  for (const action of proposal.actions) {
    if (action.operation === "delete") {
      const reason =
        action.kind === "character"
          ? characterDeletionReason(action.targetId!, catalog.stories)
          : universeDeletionReason(
              action.targetId!,
              catalog.stories,
              characters,
            );
      if (reason) errors.set(action.id, reason);
    }
    if (
      action.kind === "character" &&
      action.after &&
      getUniverseIds(action.after as PlayerCharacter).some(
        (id) => !universes.some((item) => item.id === id),
      )
    )
      errors.set(
        action.id,
        "A referenced universe is missing or being deleted.",
      );
  }
  return proposal.actions.map((action) => ({
    actionId: action.id,
    status: errors.has(action.id) ? "failed" : "not_applied",
    detail: `${action.kind} "${(action.after ?? action.before)?.name ?? action.targetId}": ${errors.get(action.id) ?? "No changes applied because the batch did not pass validation."}`,
  }));
}
export function formatActionResults(results: ActionResult[]) {
  const succeeded = results.filter((item) => item.status === "applied").length;
  return `${succeeded} of ${results.length} library changes applied.\n\n${results.map((item) => `- ${item.status === "applied" ? "" : `${item.status}: `}${item.detail}`).join("\n")}`;
}

/** One transaction commits library writes AND the confirmation receipt: safe across refresh/replay. */
export async function decideProposal(
  conversationId: string,
  proposalId: string,
  decision: "accept" | "reject",
  expectedRevision: number,
): Promise<Conversation> {
  if (decision !== "accept" && decision !== "reject")
    throw new Error("Choose accept or reject explicitly.");
  const db = await openStoryEngineDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["metaChatThreads", "universes", "playerCharacters", "stories"],
      "readwrite",
    );
    const threads = tx.objectStore("metaChatThreads");
    const reads = [
      threads.get(conversationId),
      tx.objectStore("universes").getAll(),
      tx.objectStore("playerCharacters").getAll(),
      tx.objectStore("stories").getAll(),
    ];
    let ready = 0;
    let result: Conversation;
    let error: unknown;
    for (const request of reads)
      request.onsuccess = () => {
        if (++ready !== reads.length) return;
        try {
          const conversation = reads[0].result as Conversation | undefined;
          if (
            !conversation ||
            conversation.deletedAt ||
            conversation.revision !== expectedRevision
          )
            throw new Error(CONVERSATION_CONFLICT);
          if (conversation.request?.status === "pending")
            throw new Error(
              "Wait for the current reply before reviewing actions.",
            );
          const message = conversation.messages.find(
            (item) => item.proposal?.id === proposalId,
          );
          const proposal = message?.proposal;
          if (!proposal || proposal.status !== "pending")
            throw new Error(
              "This proposal has already been handled or is no longer active.",
            );
          if (decision === "reject") proposal.status = "rejected";
          else {
            const catalog = {
              universes: reads[1].result as Universe[],
              characters: reads[2].result as PlayerCharacter[],
              stories: reads[3].result as Story[],
            };
            const checks = validateBatch(proposal, catalog);
            if (checks.some((item) => item.status === "failed")) {
              proposal.status = "failed";
              proposal.results = checks;
            } else {
              for (const action of proposal.actions) {
                const store = tx.objectStore(
                  action.kind === "character"
                    ? "playerCharacters"
                    : "universes",
                );
                if (action.operation === "delete")
                  store.delete(action.targetId!);
                else store.put(action.after!);
              }
              proposal.status = "accepted";
              proposal.results = proposal.actions.map((action) => ({
                actionId: action.id,
                status: "applied",
                detail: `${{ create: "Created", update: "Updated", delete: "Deleted" }[action.operation]} ${action.kind} "${(action.after ?? action.before)?.name}".`,
              }));
            }
          }
          const now = new Date().toISOString();
          result = {
            ...conversation,
            revision: conversation.revision + 1,
            updatedAt: now,
            messages: [
              ...conversation.messages,
              {
                id: createEntityId("meta-result"),
                role: "system",
                content:
                  decision === "reject"
                    ? "Library proposal rejected. No changes applied."
                    : formatActionResults(proposal.results!),
                createdAt: now,
              },
            ],
          };
          threads.put(result);
        } catch (cause) {
          error = cause;
          tx.abort();
        }
      };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () =>
      reject(
        error ??
          tx.error ??
          new Error("No changes applied: the library transaction failed."),
      );
  });
}
