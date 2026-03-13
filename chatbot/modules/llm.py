"""
LLM module.
Handles answer generation using the HuggingFace Inference API (openai/gpt-oss-20b).
"""

from huggingface_hub import InferenceClient
from fastapi import HTTPException

from config import HF_TOKEN, LLM_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS


def generate_answer(question: str, context_chunks: list[dict]) -> str:
    """
    Generate an answer using the LLM, grounded in the provided context chunks.

    Args:
        question: User's question.
        context_chunks: List of chunk dicts (must have "text" key).

    Returns:
        The LLM's answer string.
    """
    if not HF_TOKEN:
        raise HTTPException(status_code=500, detail="HF_TOKEN not set in .env file.")

    client = InferenceClient(
        model=LLM_MODEL,
        token=HF_TOKEN,
    )

    # Build context with metadata so the LLM knows which page/chunk each text is from
    context_parts = []
    for c in context_chunks:
        header = f"[Source: {c.get('source', 'unknown')} | Page: {c.get('page_number', '?')} | Chunk Index: {c.get('chunk_index', '?')}]"
        context_parts.append(f"{header}\n{c['text']}")
    context_text = "\n\n".join(context_parts)

    prompt = f"""You are a helpful assistant. Answer the question using ONLY the information given in the context.
Each context block has metadata showing its source file, page number, and chunk index.
Use this metadata to answer questions about specific pages or chunks.
If the answer is not in the context, then answer based on your knowledge, but say "Based on my knowledge" at the start of the answer to indicate this.

Context:
{context_text}

Question:
{question}

Answer:"""

    try:
        response = client.chat_completion(
            messages=[
                {"role": "system", "content": "You answer strictly from the given context."},
                {"role": "user", "content": prompt},
            ],
            temperature=LLM_TEMPERATURE,
            max_tokens=LLM_MAX_TOKENS,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")
