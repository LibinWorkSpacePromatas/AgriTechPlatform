import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface WeatherData {
    current: {
        temperature: number;
        windSpeed: number;
        windDirection: number;
        weatherCode: number;
        isDay: number;
        time: string;
        relativeHumidity: number;
        cloudCover: number;
    };
    hourly: {
        time: string[];
        temperature_2m: number[];
        relative_humidity_2m: number[];
        rain: number[];
        cloud_cover: number[];
        wind_speed_10m: number[];
    };
    daily: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
    };
}

@Injectable({
    providedIn: 'root'
})
export class WeatherService {
    private readonly API_URL = 'https://api.open-meteo.com/v1/forecast';

    constructor(private http: HttpClient) { }

    getWeatherForecast(lat?: number, lon?: number): Observable<WeatherData> {
        // Default to Berri, SA if no coordinates provided
        const latitude = lat ?? -34.28;
        const longitude = lon ?? 140.60;

        console.log('🌍 WeatherService: Fetching weather for coordinates:', { latitude, longitude });

        const params = [
            `latitude=${latitude}`,
            `longitude=${longitude}`,
            'current=temperature_2m,is_day,rain,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,cloud_cover',
            'hourly=temperature_2m,relative_humidity_2m,rain,cloud_cover,wind_speed_10m',
            'daily=temperature_2m_max,temperature_2m_min',
            'timezone=Australia%2FAdelaide',
            'forecast_days=8'
        ].join('&');

        const fullUrl = `${this.API_URL}?${params}`;
        console.log('📡 API URL:', fullUrl);

        return this.http.get<any>(fullUrl).pipe(
            map(response => ({
                current: {
                    temperature: response.current.temperature_2m,
                    windSpeed: response.current.wind_speed_10m,
                    windDirection: response.current.wind_direction_10m,
                    weatherCode: response.current.weather_code,
                    isDay: response.current.is_day,
                    time: response.current.time,
                    relativeHumidity: response.current.relative_humidity_2m,
                    cloudCover: response.current.cloud_cover
                },
                hourly: {
                    time: response.hourly.time,
                    temperature_2m: response.hourly.temperature_2m,
                    relative_humidity_2m: response.hourly.relative_humidity_2m,
                    rain: response.hourly.rain,
                    cloud_cover: response.hourly.cloud_cover,
                    wind_speed_10m: response.hourly.wind_speed_10m
                },
                daily: {
                    time: response.daily.time,
                    temperature_2m_max: response.daily.temperature_2m_max,
                    temperature_2m_min: response.daily.temperature_2m_min
                }
            }))
        );
    }

    // Helper to interpret weather codes
    getWeatherDescription(code: number): string {
        const codes: { [key: number]: string } = {
            0: 'Clear sky',
            1: 'Mainly clear',
            2: 'Partly cloudy',
            3: 'Overcast',
            45: 'Fog',
            48: 'Depositing rime fog',
            51: 'Light drizzle',
            53: 'Moderate drizzle',
            55: 'Dense drizzle',
            61: 'Slight rain',
            63: 'Moderate rain',
            65: 'Heavy rain',
            71: 'Slight snow fall',
            73: 'Moderate snow fall',
            75: 'Heavy snow fall',
            95: 'Thunderstorm'
        };
        return codes[code] || 'Unknown';
    }
}
