import { bootstrapApplication } from '@angular/platform-browser';
import { APP_INITIALIZER } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { UserDataService } from './app/core/services/user-data.service';

function initializeUserData(userDataService: UserDataService) {
    return () => userDataService.initialize();
}

bootstrapApplication(AppComponent, {
    providers: [
        provideRouter(routes),
        provideHttpClient(),
        {
            provide: APP_INITIALIZER,
            useFactory: initializeUserData,
            deps: [UserDataService],
            multi: true
        }
    ]
}).catch(err => console.error(err));
