"""
OpenAI Embeddings via OpenRouter
Handles embedding generation using OpenAI's text-embedding-3-small model
"""

import requests
import json
import time
from typing import List, Union
from tqdm import tqdm


class OpenAIEmbeddings:
    """Generate embeddings using OpenAI's API via OpenRouter"""
    
    def __init__(
        self,
        api_key: str,
        model: str = "openai/text-embedding-3-small",
        api_url: str = "https://openrouter.ai/api/v1/embeddings",
        site_url: str = None,
        site_name: str = None,
        max_retries: int = 3,
        retry_delay: int = 2
    ):
        """
        Initialize OpenAI embeddings client
        
        Args:
            api_key: OpenRouter API key
            model: Model name (default: openai/text-embedding-3-small)
            api_url: OpenRouter API endpoint
            site_url: Optional site URL for rankings
            site_name: Optional site name for rankings
            max_retries: Maximum number of retries on failure
            retry_delay: Delay between retries in seconds
        """
        self.api_key = api_key
        self.model = model
        self.api_url = api_url
        self.site_url = site_url
        self.site_name = site_name
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        # Model dimension mapping
        self.dimension_map = {
            "openai/text-embedding-3-small": 1536,
            "openai/text-embedding-3-large": 3072,
            "openai/text-embedding-ada-002": 1536
        }
    
    def get_sentence_embedding_dimension(self) -> int:
        """Get the dimension of embeddings for the current model"""
        return self.dimension_map.get(self.model, 1536)
    
    def _make_request(self, texts: Union[str, List[str]]) -> List[List[float]]:
        """
        Make API request to generate embeddings
        
        Args:
            texts: Single text or list of texts
            
        Returns:
            List of embedding vectors
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # Add optional headers
        if self.site_url:
            headers["HTTP-Referer"] = self.site_url
        if self.site_name:
            headers["X-Title"] = self.site_name
        
        payload = {
            "model": self.model,
            "input": texts,
            "encoding_format": "float"
        }
        
        # Retry logic
        for attempt in range(self.max_retries):
            try:
                response = requests.post(
                    self.api_url,
                    headers=headers,
                    data=json.dumps(payload),
                    timeout=30
                )
                
                if response.status_code == 200:
                    result = response.json()
                    # Extract embeddings in order
                    embeddings = [item['embedding'] for item in sorted(result['data'], key=lambda x: x['index'])]
                    return embeddings
                else:
                    error_msg = f"API request failed with status {response.status_code}: {response.text}"
                    if attempt < self.max_retries - 1:
                        print(f"   Warning: {error_msg}")
                        print(f"   Retrying in {self.retry_delay} seconds... (Attempt {attempt + 1}/{self.max_retries})")
                        time.sleep(self.retry_delay)
                    else:
                        raise Exception(error_msg)
                        
            except requests.exceptions.RequestException as e:
                if attempt < self.max_retries - 1:
                    print(f"   Warning: Network error - {str(e)}")
                    print(f"   Retrying in {self.retry_delay} seconds... (Attempt {attempt + 1}/{self.max_retries})")
                    time.sleep(self.retry_delay)
                else:
                    raise Exception(f"Network error after {self.max_retries} attempts: {str(e)}")
        
        raise Exception("Failed to generate embeddings after all retry attempts")
    
    def encode(
        self,
        texts: Union[str, List[str]],
        batch_size: int = 100,
        show_progress_bar: bool = True,
        normalize_embeddings: bool = False
    ) -> List[List[float]]:
        """
        Encode texts into embeddings (compatible with SentenceTransformer interface)
        
        Args:
            texts: Single text or list of texts to encode
            batch_size: Number of texts to process in each API call
            show_progress_bar: Whether to show progress bar
            normalize_embeddings: Whether to normalize embeddings (not implemented for API)
            
        Returns:
            List of embedding vectors
        """
        # Handle single text input
        if isinstance(texts, str):
            texts = [texts]
        
        all_embeddings = []
        
        # Process in batches
        num_batches = (len(texts) + batch_size - 1) // batch_size
        
        iterator = range(0, len(texts), batch_size)
        if show_progress_bar and num_batches > 1:
            iterator = tqdm(iterator, desc="Generating embeddings", total=num_batches)
        
        for i in iterator:
            batch = texts[i:i + batch_size]
            
            # Generate embeddings for batch
            batch_embeddings = self._make_request(batch)
            all_embeddings.extend(batch_embeddings)
            
            # Rate limiting: small delay between batches
            if i + batch_size < len(texts):
                time.sleep(0.1)
        
        # Note: normalize_embeddings is ignored as API returns normalized embeddings by default
        if normalize_embeddings:
            print("   Note: OpenAI embeddings are pre-normalized, normalization flag ignored")
        
        return all_embeddings


def test_embeddings():
    """Test function to verify embedding generation"""
    import sys
    from pathlib import Path
    
    # Add parent directory to path to import config
    sys.path.insert(0, str(Path(__file__).parent.parent))
    
    from chatbot.config import OPENROUTER_API_KEY, EMBEDDING_MODEL
    
    print("Testing OpenAI Embeddings via OpenRouter...")
    print("=" * 70)
    
    # Initialize embeddings client
    embedder = OpenAIEmbeddings(
        api_key=OPENROUTER_API_KEY,
        model=EMBEDDING_MODEL
    )
    
    # Test with sample texts
    test_texts = [
        "Chronic kidney disease (CKD) is a progressive loss of kidney function.",
        "Glomerular filtration rate (GFR) measures kidney function.",
        "Dialysis is a treatment for kidney failure."
    ]
    
    print(f"\nGenerating embeddings for {len(test_texts)} test texts...")
    print(f"Model: {EMBEDDING_MODEL}")
    print(f"Expected dimension: {embedder.get_sentence_embedding_dimension()}")
    
    embeddings = embedder.encode(test_texts, show_progress_bar=False)
    
    print(f"\nSuccess!")
    print(f"Generated {len(embeddings)} embeddings")
    print(f"Embedding dimension: {len(embeddings[0])}")
    print(f"First embedding sample: {embeddings[0][:5]}...")
    
    print("\n" + "=" * 70)
    print("Embeddings are working correctly!")


if __name__ == "__main__":
    test_embeddings()
