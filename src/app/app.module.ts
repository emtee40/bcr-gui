import { IntlModule } from 'angular-ecmascript-intl';
import { CommonModule, DatePipe } from '@angular/common';
import { APP_INITIALIZER, NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy, RouterModule } from '@angular/router';
import { IonicModule, IonicRouteStrategy, Platform } from '@ionic/angular';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AudioPlayerComponent } from './components/audio-player/audio-player.component';
import { CallIconComponent } from './components/call-icon/call-icon.component';
import { HeaderComponent } from './components/header/header.component';
import { MetadataEditorComponent } from './components/metadata-editor/metadata-editor.component';
import { TagsDatabaseComponent } from './components/tags-database/tags-database.component';
import { AboutPage } from './pages/about/about.page';
import { MainPage } from './pages/main/main.page';
import { SettingsPage } from './pages/settings/settings.page';
import { FilesizePipe } from './pipes/filesize.pipe';
import { RecordingsSortPipe } from './pipes/recordings-sort.pipe';
import { ToHmsPipe } from './pipes/to-hms.pipe';
import { RecordingsService } from './services/recordings.service';
import { SettingsService } from './services/settings.service';

@NgModule({
  declarations: [
    AboutPage,
    AppComponent,
    AudioPlayerComponent,
    FilesizePipe,
    HeaderComponent,
    MainPage,
    MetadataEditorComponent,
    RecordingsSortPipe,
    SettingsPage,
    TagsDatabaseComponent,
    ToHmsPipe,
  ],
  imports: [
    AppRoutingModule,
    BrowserModule,
    CallIconComponent,
    CommonModule,
    FormsModule,
    IntlModule,
    IonicModule.forRoot({ innerHTMLTemplatesEnabled: true }),
    RouterModule,
  ],
  providers: [
    DatePipe,
    ToHmsPipe,
    { provide: APP_INITIALIZER, useFactory: appInitializer, deps: [ RecordingsService, SettingsService, Platform ], multi: true },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
  ],
  bootstrap: [
    AppComponent
  ],
})
export class AppModule {}

/**
 * Load settings and set languages before app start
 */
function appInitializer(recordingsService: RecordingsService, settings: SettingsService, platform: Platform) {
  return async () => {

    // wait for Ionic initialization
    await platform.ready();

    // initialize settings
    await settings.initialize();

    // initialize recordings service
    await recordingsService.initialize();

  }
}

