# Memory Entry Template

Every persistent memory entry in this repository MUST conform to this model.
Entries are stored as JSON files so they can be read and written by any
tooling or agent in a fresh session without parsing prose or ad-hoc formats.

---

## JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MemoryEntry",
  "type": "object",
  "required": ["id", "kind", "title", "body", "created", "tags"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique, stable identifier. Use kebab-case, e.g. 'backend-auth-flow'."
    },
    "kind": {
      "type": "string",
      "enum": ["axiom", "decision", "discovery", "reference", "rule"],
      "description": "Category of the memory entry."
    },
    "title": {
      "type": "string",
      "description": "One-line summary. Used for indexing and search."
    },
    "body": {
      "type": "string",
      "description": "Free-form content. Markdown is permitted but MUST be self-contained — no relative links to repo files."
    },
    "created": {
      "type": "string",
      "format": "date-time",
      "description": "ISO-8601 timestamp of when this entry was first written."
    },
    "updated": {
      "type": "string",
      "format": "date-time",
      "description": "ISO-8601 timestamp of last modification. Omit if never updated."
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "description": "Lowercase, no spaces. Use for grouping and filtering."
    },
    "context": {
      "type": "object",
      "description": "Optional metadata that helps decide when this entry is relevant.",
      "properties": {
        "files": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Repo-relative paths this entry pertains to."
        },
        "symbols": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Function, class, or type names this entry references."
        }
      }
    }
  }
}
```

## Kind Definitions

| Kind         | Use when…                                                                 |
|--------------|---------------------------------------------------------------------------|
| `axiom`      | Recording a project axiom (linked to a § number in CLAUDE.md).            |
| `decision`   | Capturing a design choice, trade-off, or rejected alternative.            |
| `discovery`  | Documenting something learnt about the codebase that isn't obvious.       |
| `reference`  | Storing a pointer to an external system, URL, or contact.                 |
| `rule`       | Encoding a constraint that isn't an axiom but should still be followed.   |

## File Convention

- Filename: `{id}.json` (the `id` field, not the title).
- Encoding: UTF-8, no BOM.
- Pretty-printed (indent: 2 spaces), trailing newline.
