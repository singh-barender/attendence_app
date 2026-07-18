# @attendance-app/face-matching

Shared logic for extracting facial embedding vectors and verifying identity matches. 
This package is used by both the frontend (React Native via Vision Camera worklets) and the backend.

It wraps `@vladmandic/human` and standard TensorFlow mechanisms for cosine similarity comparisons between biometric embeddings.
