import concurrent.futures
import requests

url = 'http://localhost:5000/api/books/test-slug/sections/section_0001/narrate'

def patch_narrate(i):
    try:
        r = requests.patch(url)
        return r.status_code, r.text
    except Exception as e:
        return 0, str(e)

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(patch_narrate, i) for i in range(10)]
    for f in concurrent.futures.as_completed(futures):
        print(f.result())
