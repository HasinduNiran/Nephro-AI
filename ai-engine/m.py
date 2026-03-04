import chromadb
client = chromadb.PersistentClient(path="vectordb/chroma_db")
collection = client.get_collection("nephro_ai_medical_kb")

# Query only documents tagged with CKD
results = collection.get(
    where={"has_ckd": True}, 
    limit=5
)

print(f"Verified Documents with CKD flag: {len(results['ids'])}")
for meta in results['metadatas']:
    print(f"Source: {meta['source']} | has_ckd: {meta['has_ckd']}")