import requests

url = 'http://localhost:5000/api/books/extract'
files = {'pdf': open('C:/Users/metha/Desktop/AudiobookPipeline/assets/raw_pdfs/test.pdf', 'rb')}
data = {'slug': 'test-slug'}

response = requests.post(url, files=files, data=data)
print(response.status_code)
print(response.text)
