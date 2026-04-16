import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="192.168.1.71", port=8000, reload=True)
