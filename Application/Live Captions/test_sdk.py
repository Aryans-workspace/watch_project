import asyncio
import os
from google import genai
from google.genai import types

os.environ['GEMINI_API_KEY'] = 'AQ.Ab8RN6JNWWWwySdSnt5Cb29dI4e8XrVSB8yEPBH2DfdsG0WK8Q'
client = genai.Client()

async def test_live():
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents='Hello, can you hear me?'
        )
        print("Response:", response.text)
    except Exception as e:
        print("Error:", e)

asyncio.run(test_live())
