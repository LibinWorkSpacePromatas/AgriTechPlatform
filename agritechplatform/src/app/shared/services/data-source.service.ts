import { Injectable } from '@angular/core';
import { APP_CONSTANTS } from '../constants';

export interface DataSourceInfo {
    name: string;
    lastUpdated: Date;
    status: 'active' | 'inactive' | 'error';
}

@Injectable({
    providedIn: 'root'
})
export class DataSourceService {

    private dataSources: Map<string, DataSourceInfo> = new Map();

    constructor() {
        // Initialize with default data sources
        this.initializeDataSources();
    }

    private initializeDataSources(): void {
        Object.entries(APP_CONSTANTS.DATA_SOURCES).forEach(([key, name]) => {
            this.dataSources.set(key, {
                name,
                lastUpdated: new Date(),
                status: 'active'
            });
        });
    }

    getDataSource(key: string): DataSourceInfo | undefined {
        return this.dataSources.get(key);
    }

    getAllDataSources(): DataSourceInfo[] {
        return Array.from(this.dataSources.values());
    }

    updateDataSourceStatus(key: string, status: 'active' | 'inactive' | 'error'): void {
        const source = this.dataSources.get(key);
        if (source) {
            source.status = status;
            source.lastUpdated = new Date();
        }
    }

    getModelVersion(): string {
        return APP_CONSTANTS.ML_MODEL_VERSION;
    }
}
