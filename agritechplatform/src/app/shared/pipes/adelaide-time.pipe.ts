import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'adelaideTime',
    standalone: true
})
export class AdelaideTimePipe implements PipeTransform {

    transform(value: Date | string | number, format: 'short' | 'long' | 'time' | 'date' = 'short'): string {
        if (!value) return '';

        const date = new Date(value);

        // Options for Adelaide timezone
        const timeZone = 'Australia/Adelaide';

        let options: Intl.DateTimeFormatOptions;

        switch (format) {
            case 'long':
                options = {
                    timeZone,
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                };
                break;
            case 'time':
                options = {
                    timeZone,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                };
                break;
            case 'date':
                options = {
                    timeZone,
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                };
                break;
            case 'short':
            default:
                options = {
                    timeZone,
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                };
        }

        return new Intl.DateTimeFormat('en-AU', options).format(date);
    }
}
