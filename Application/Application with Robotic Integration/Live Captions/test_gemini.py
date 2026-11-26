import asyncio
import websockets
import json
import base64
import sounddevice as sd
import queue

API_KEY = "AQ.Ab8RN6JNWWWwySdSnt5Cb29dI4e8XrVSB8yEPBH2DfdsG0WK8Q"

async def test_live():
    uri = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={API_KEY}"
    
    q = queue.Queue()
    def audio_callback(indata, frames, time, status):
        q.put(bytes(indata))

    try:
        print("Connecting to Gemini Live...")
        async with websockets.connect(uri) as ws:
            setup_msg = {
                "setup": {
                    "model": "models/gemini-2.0-flash-exp",
                    "systemInstruction": {
                        "parts": [{"text": "You are a real-time translator. The user speaks English. Output only the Italian translation. Do not output anything else."}]
                    }
                }
            }
            await ws.send(json.dumps(setup_msg))
            setup_response = await ws.recv()
            print("Setup response:", setup_response)
            
            print("Listening in English (speak now)...")
            
            async def send_audio():
                with sd.RawInputStream(samplerate=16000, blocksize=4096, device=None, dtype='int16', channels=1, callback=audio_callback):
                    while True:
                        data = await asyncio.get_event_loop().run_in_executor(None, q.get)
                        msg = {
                            "realtimeInput": {
                                "mediaChunks": [{
                                    "mimeType": "audio/pcm;rate=16000",
                                    "data": base64.b64encode(data).decode('utf-8')
                                }]
                            }
                        }
                        await ws.send(json.dumps(msg))
                        
            async def receive_text():
                async for message in ws:
                    data = json.loads(message)
                    if "serverContent" in data:
                        modelTurn = data["serverContent"].get("modelTurn", {})
                        parts = modelTurn.get("parts", [])
                        for part in parts:
                            if "text" in part:
                                print(part["text"], end="", flush=True)
                        if data["serverContent"].get("turnComplete"):
                            print("\n[Turn Complete]")
                            
            await asyncio.gather(send_audio(), receive_text())
            
    except Exception as e:
        print("Error:", e)

asyncio.run(test_live())
