import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './ui/toast';

@Component({
  imports: [RouterOutlet, ToastHost],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
}
