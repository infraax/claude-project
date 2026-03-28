# Skill: vector-ops

## When to load
Before any Pinecone, Qdrant, or LanceDB read/write operation, especially batch upserts or semantic queries.

## Storage tiers — which to use when

| Store | Use for | Location | Free limit |
|-------|---------|----------|-----------|
| **LanceDB** (local) | Per-session memory, file summaries, fast local queries | `<memory_path>/vectors/` | Unlimited (local) |
| **Pinecone** (cloud) | Persistent cross-session vectors, production retrieval | Serverless index | 2 GB, 5 indexes |
| **Qdrant** (cloud) | Experimental collections, fallback | `81c822d4...eu-central-1` | 0.5 GB disk |

**Rule**: Use LanceDB for anything ephemeral or session-local. Use Pinecone for anything that needs to persist or be queried by other sessions/agents.

## Embedding model (used everywhere)

```python
model = "all-MiniLM-L6-v2"   # 384 dimensions
# Loaded via sentence-transformers in mcp/server.py (_get_embed_model)
# Same model must be used for upsert AND query — never mix models
```

## LanceDB — MCP tool access (preferred)

```python
# Store to LanceDB + SQLite atomically
store_memory(category="discovery", text="Claude Code MCP server handles memory routing")
store_memory(category="decision", text="Using Pinecone for production, LanceDB for local")

# Semantic search
query_memory(query="how does prompt caching work", limit=5)

# File summaries — always use before reading a file
set_file_summary(path="src/extension.ts", summary="VS Code extension — init, sync, inject commands")
get_file_summary(path="src/extension.ts")
find_related_files(query="MCP server registration", limit=5)
```

## Pinecone — namespace conventions

```
index: claude-project (serverless, us-east-1)
  namespace: claude-project   ← project memory + decisions
  namespace: research          ← ablation results, analysis
  namespace: ablation          ← per-condition observation vectors
  namespace: pd-registry       ← Protocol Document embeddings
```

Always use namespaces — never upsert to the root namespace.

## Pinecone — Python patterns

```python
from pinecone import Pinecone
import os

pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
index = pc.Index("claude-project")

# Upsert
index.upsert(
    vectors=[{"id": "mem-abc123", "values": embedding_list, "metadata": {"text": "...", "category": "decision"}}],
    namespace="claude-project"
)

# Query
results = index.query(
    vector=query_embedding,
    top_k=5,
    namespace="claude-project",
    include_metadata=True
)
```

## Pre-operation quota check

```python
# ALWAYS call before batch upserts (>50 vectors)
use_mcp_tool("infra-monitor", "check_pinecone", {})
# Check: total_indexes < 5, fullness < 0.8
```

## Qdrant — patterns (fallback/experimental)

```python
from qdrant_client import QdrantClient

client = QdrantClient(
    url=os.environ["QDRANT_URL"],
    api_key=os.environ["QDRANT_API_KEY"]
)

# Create collection
client.create_collection("experiments",
    vectors_config={"size": 384, "distance": "Cosine"})

# Upsert
client.upsert("experiments", points=[
    PointStruct(id=1, vector=embedding, payload={"text": "..."})
])

# Query
results = client.search("experiments", query_vector=embedding, limit=5)
```

**Limit**: 0.5 GB disk — only use for small experimental collections.

## After batch upsert — log usage

```python
use_mcp_tool("infra-monitor", "log_usage", {
    "service": "pinecone",
    "metric": "write_units",
    "value": num_vectors * 1000,  # approximate write units
    "context": "ablation v3 embedding run"
})
```

## Common mistakes to avoid

- Do NOT mix embedding models between upsert and query — results will be wrong
- Do NOT upsert to Qdrant for anything > 50K vectors (0.5 GB disk limit)
- Do NOT create more than 5 Pinecone indexes (free tier hard limit)
- Always check `check_pinecone` if `fullness > 0.8` — index is near capacity
- LanceDB vectors are **not backed up** — re-create from memory text if lost
