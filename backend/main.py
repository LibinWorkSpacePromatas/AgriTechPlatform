import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import grower_gpt, chat, users, crops, sensors

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(grower_gpt.router)
app.include_router(chat.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(crops.router, prefix="/api")
app.include_router(sensors.router, prefix="/api")
