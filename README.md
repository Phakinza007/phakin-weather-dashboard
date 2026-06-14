# Weather Dashboard

A weather dashboard with OpenWeatherMap API proxy, 10-minute caching, favorites, and search history.

**Live Demo:** [View on Portfolio](https://phakinza007.github.io/my-portfolio/)

## Features
- Current weather by city name or coordinates
- 5-day hourly forecast
- City autocomplete search
- Favorite cities (persistent)
- Response caching (10 min) to save API calls

## Setup
1. Get a free API key at [openweathermap.org](https://openweathermap.org/api)
2. Add it to .env:

`\\ash
cd backend && npm install && cp .env.example .env
# Edit .env: OPENWEATHER_API_KEY=your_key_here
npm run dev
`\\
API runs on http://localhost:3007

---
*Built by [Phakin Chawanpunya](https://github.com/Phakinza007)*
