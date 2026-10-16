# Roamly — AI Travel Companion

Professional, mobile-first React + Vite + Capacitor starter for an Android travel app.

## Features
- Floating AI chatbot powered by an Express backend proxy to OpenRouter, with actionable error messages.
- Light, dark and sage themes; your choice is remembered on the device.
- AI itinerary planner with trip length, dates, travelers, budget and travel style.
- Destination gallery that filters out weakly related Wikimedia Commons image matches rather than showing unrelated pictures.
- Weather forecast through Open-Meteo.
- Requests device location permission on startup; a manual location button is also provided.
- Smart Group Trip Matcher with destination, budget, dates and interest preferences; ranks 12 curated travel organisers and lets users open official websites or copy an enquiry.
- Group budget splitter.
- Local Lens with 12 interest categories and AI-generated suggestions for at least 10 beyond-tourist experiences.
- AI Travel Companion Camera: upload a landmark, menu or sign photo for vision-based identification, history clues or text reading.
- Plan B AI to rework itineraries for rain, train disruption, unavailable hotels, missed opening hours and other surprises. Live availability is not claimed unless an actual provider integration supplies it.
- Personal Travel Safety Planner tailored to traveller type and destination.
- Google Maps search/directions and IRCTC train-search links.
- Hotel search by destination, check-in/out dates and guest count.
- Booking.com, Google Hotels and Agoda links for live prices, photos and room availability.
- Optional live hotel cards with images, ratings, nightly rates and booking links through a backend using SerpApi Google Hotels.

## Run in VS Code (Windows PowerShell)
1. Install Node.js LTS. For Android APK builds also install JDK 17 and Android SDK command-line tools/platform/build tools. Android Studio is not required as your editor, but Android SDK is still required.
2. Extract the ZIP and open the `roamly-ai-travel-assistant` folder in VS Code.
3. Run:
   ```powershell
   npm install
   Copy-Item .env.example .env
   ```
4. Edit `.env` and add `OPENROUTER_API_KEY=your_key`. Get a key at https://openrouter.ai/keys. Keep this key backend-only (no `VITE_` prefix). Save the file.
5. Run `npm run dev`. This starts both the API server and the Vite frontend. Open the localhost URL shown by Vite (usually `http://localhost:5173`). The API server uses port 5000.
6. Check `http://localhost:5000/api/health` in your browser: it should show `"keyConfigured":true`. If it shows `false`, the `.env` file is missing/misnamed or the key is blank.
7. Open the chatbot and ask a question. The chatbot and image-identification endpoint use the backend key; the UI includes a render-error fallback so a component error should show a recovery message rather than silently blanking the whole page; if a request fails, check the message for missing key, credits, model or server issues. The API key must be stored as `OPENROUTER_API_KEY`, not as a `VITE_` variable.

## Hotel prices and availability
Without a provider API key, the Hotels tab opens searches on Booking.com, Google Hotels and Agoda. These show current prices, photos, availability and terms on their sites; the app intentionally does not invent prices.
To show hotel results inside the app:
1. Get a SerpApi key at https://serpapi.com/ and check their current price/usage terms.
2. Put it in `.env` as `SERPAPI_API_KEY=your_key` (no `VITE_` prefix).
3. Run `npm run dev`; it starts the frontend and backend together. Vite proxies `/api` to localhost:5000.
4. For deployment, host the backend and set `VITE_API_BASE_URL` to its URL. Keep provider keys on the backend.

## Build APK
```powershell
npm run build
npx cap add android
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```
If `android` already exists, skip `npx cap add android` and run `npx cap sync android`.
APK output: `android\app\build\outputs\apk\debug\app-debug.apk`.

## New features and honest data limits
- Local Lens returns AI suggestions and is not a live directory of verified local businesses. Confirm specific venues and opening hours.
- The group matcher ranks a curated static directory of 12 organisers based on the interests and budget bands entered. It does not receive live departure inventories or verify a provider independently. Official website links are provided so you can check credentials, exact trip details and contact channels directly.
- The Camera sends the selected image to the configured OpenRouter vision-capable model. The result is an AI suggestion, not guaranteed identification. Keep uploads under 5 MB and do not upload IDs, tickets or private faces.
- Plan B and the safety planner are AI-guided, not emergency dispatch or live monitoring.

## Important limitations
- Geolocation always requires the user to grant permission; it cannot be taken silently.
- OpenRouter requests use the backend proxy. For a publicly released APK, deploy the backend to a secure HTTPS host and set `VITE_API_BASE_URL` to that server URL; a local backend on your laptop is not reachable from other people’s phones.
- Google Maps is linked externally; a full embedded map needs a Google Maps API key and suitable configuration.
- IRCTC link opens official train search; the app does not book tickets.
- The group matcher uses curated official-site links; it does not verify the operators independently or guarantee availability. Confirm current details and payment terms directly.
- Verify hotel prices, taxes, availability and cancellation policies on the booking provider before payment.
