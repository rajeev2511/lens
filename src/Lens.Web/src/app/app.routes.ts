import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'live' },
  { path: 'live', title: 'Lens - Live', loadComponent: () => import('./pages/live/live-page').then((m) => m.LivePage) },
  { path: 'cameras', title: 'Lens - Cameras', loadComponent: () => import('./pages/cameras/cameras-page').then((m) => m.CamerasPage) },
  { path: 'search', title: 'Lens - Search', loadComponent: () => import('./pages/search/search-page').then((m) => m.SearchPage) },
  { path: 'ask', title: 'Lens - Ask', loadComponent: () => import('./pages/ask/ask-page').then((m) => m.AskPage) },
  { path: 'videos', title: 'Lens - Videos', loadComponent: () => import('./pages/videos/videos-page').then((m) => m.VideosPage) },
  { path: '**', redirectTo: 'live' },
];
