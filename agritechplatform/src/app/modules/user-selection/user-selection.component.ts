import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule, Leaf } from 'lucide-angular';
import { User } from '../../core/models/user.model';
import { UserDataService } from '../../core/services/user-data.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-user-selection',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    templateUrl: './user-selection.component.html',
    styleUrls: ['./user-selection.component.css']
})
export class UserSelectionComponent implements OnInit {
    users: User[] = [];
    LeafIcon = Leaf;

    constructor(
        private userDataService: UserDataService,
        private authService: AuthService,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.users = this.userDataService.getUsers();
    }

    selectUser(user: User): void {
        const success = this.authService.login(user.userId);
        if (success) {
            this.router.navigate(['/dashboard']);
        }
    }

    getInitials(name: string): string {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase();
    }

    getAvatarColor(index: number): string {
        const colors = [
            'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
            'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
            'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
            'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
            'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)'
        ];
        return colors[index % colors.length];
    }
}
