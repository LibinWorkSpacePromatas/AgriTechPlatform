import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApiUserResponse {
    id: string;
    name: string;
    region: string;
    council: string;
    farm_name: string;
    farm_location: string;
    primary_crop: string;
    primary_soil: string;
}

export interface ApiBlockResponse {
    id: string;
    user_id: string;
    lanslu: string;
    soil_subgroup: string;
    soil_class: string;
    description: string;
    area_ha: number;
    crop: string;
    block_polygon: {
        type: 'Polygon' | 'MultiPolygon';
        coordinates: number[][][] | number[][][][];
    } | null;
    centroid_lat: number | null;
    centroid_lon: number | null;
}

@Injectable({
    providedIn: 'root'
})
export class ApiService {
    private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

    constructor(private http: HttpClient) { }

    getUsers(): Observable<ApiUserResponse[]> {
        return this.http
            .get<ApiUserResponse[]>(`${this.baseUrl}/users`)
            .pipe(catchError(error => this.handleError('GET /users', error)));
    }

    getBlocks(userId: string): Observable<ApiBlockResponse[]> {
        return this.http
            .get<ApiBlockResponse[]>(`${this.baseUrl}/blocks/${userId}`)
            .pipe(catchError(error => this.handleError(`GET /blocks/${userId}`, error)));
    }

    private handleError(operation: string, error: HttpErrorResponse): Observable<never> {
        const detail = typeof error.error?.detail === 'string' ? error.error.detail : error.message;
        const message = `${operation} failed: ${detail}`;
        console.error(message, error);
        return throwError(() => new Error(message));
    }
}
