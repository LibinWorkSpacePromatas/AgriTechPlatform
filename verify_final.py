import requests
import json
import uuid

BASE_URL = "http://localhost:8001"

def test_endpoints():
    # Use the expected default IDs from the seed data if possible, or discover them
    # Based on the previous session, these are common test IDs
    USER_ID = "11111111-1111-1111-1111-111111111111" 
    BLOCK_ID = "22222222-2222-2222-2222-222222222222"

    print(f"--- Testing Clean Insights: /api/blocks/{BLOCK_ID}/insights ---")
    try:
        r = requests.get(f"{BASE_URL}/api/blocks/{BLOCK_ID}/insights")
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"Insights Count: {len(data.get('insights', []))}")
            if data.get('insights'):
                print(f"First Insight Reason: {data['insights'][0].get('reason')}")
        else:
            print(f"Error: {r.text}")
    except Exception as e:
        print(f"Request failed: {e}")

    print(f"\n--- Testing Grower GPT: /api/gpt/{BLOCK_ID} ---")
    try:
        r = requests.get(f"{BASE_URL}/api/gpt/{BLOCK_ID}")
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"Insights Count: {len(data.get('insights', []))}")
            print(f"Message: {data.get('message')}")
        else:
            print(f"Error: {r.text}")
    except Exception as e:
        print(f"Request failed: {e}")

    print(f"\n--- Testing User GPT: /api/gpt/user/{USER_ID} ---")
    try:
        r = requests.get(f"{BASE_URL}/api/gpt/user/{USER_ID}")
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"Summary: {data.get('summary')}")
            print(f"Blocks Count: {len(data.get('blocks', []))}")
        else:
            print(f"Error: {r.text}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_endpoints()
