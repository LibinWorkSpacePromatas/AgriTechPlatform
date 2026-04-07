import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  private readonly uploadUrl = `${environment.apiBaseUrl.replace(/\/$/, '')}/api/uploads/images`;

  constructor(private http: HttpClient) {}

  upload(file: File): Observable<CloudinaryUploadResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<CloudinaryUploadResult>(this.uploadUrl, form);
  }
}
