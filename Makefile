.PHONY: start-backend start-web start-mobile-android start-mobile-ios install-backend install-web install-mobile install-all test-backend lint-backend format-backend

# Backend
install-backend:
	cd varavu_selavu_app && poetry install

start-backend:
	cd varavu_selavu_app && poetry run uvicorn main:app --host 0.0.0.0 --port 8000 --reload

test-backend:
	cd varavu_selavu_app && poetry run pytest

# Web Frontend
install-web:
	cd varavu_selavu_ui && npm install

start-web:
	cd varavu_selavu_ui && npm start

# Mobile App
install-mobile:
	cd varavu_selavu_mobile && npm install

start-mobile-android:
	cd varavu_selavu_mobile && npx expo run:android

start-mobile-ios:
	cd varavu_selavu_mobile && npx expo run:ios

start-mobile-web:
	cd varavu_selavu_mobile && npx expo start --web

# Utilities
install-all: install-backend install-web install-mobile

generate-mobile-assets:
	node varavu_selavu_mobile/generate_assets.js
