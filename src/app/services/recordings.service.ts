import { BehaviorSubject } from 'rxjs';
import { AndroidSAF } from 'src/plugins/capacitorandroidsaf';
import { Injectable } from '@angular/core';
import { Encoding } from '@capacitor/filesystem';
import { AlertController, IonicSafeString } from '@ionic/angular';
import { Recording } from '../models/recording';
import { replaceExtension } from '../utils/filesystem';
import { MessageBoxService } from './message-box.service';
import { SettingsService } from './settings.service';

// database props
const DB_FILENAME = '.bcr-gui-database.json';
const DB_SCHEMA_VERSION = 1;

// database structure
type DbContent = {
  schemaVersion: number,
  data: Recording[],
}

@Injectable({
  providedIn: 'root'
})
export class RecordingsService {

  // recordings database
  public recordings = new BehaviorSubject<Recording[]>([]);

  /**
   * Refresh status:
   * value === 0    ==> no refresh running
   * 0 < value <=1  ==> refresh progress (%)
   */
  public refreshProgress = new BehaviorSubject<number>(0);

  constructor(
    private alertController: AlertController,
    private mbs: MessageBoxService,
    protected settings: SettingsService,
  ) {}

  /**
   * Initialize the recordings DB
   */
  async initialize() {

    // check if recordings directory has been selected
    if (!this.settings.recordingsDirectoryUri) {
      await this.selectRecordingsDirectory();
    }
    else {
      // load existing database from storage
      await this.load();
    }

  }

  /**
   * Refresh recordings list
   */
  async refreshContent() {

    // exit if we're already refreshing
    if (this.refreshProgress.value) {
      return;
    }

    if (!this.settings.recordingsDirectoryUri) {
      this.selectRecordingsDirectory();
      return;
    }

    // immediately send a non-zero progress
    this.refreshProgress.next(0.0001);
    console.log("Reading files in folder:");

    // save current DB and set statuses as 'deleted'
    // (if a file with the same filename won't be found, then DB record must be removed)
    let currentDB = this.recordings.value;
    currentDB.forEach(r => r.status = 'deleted');

    try {
      // keep files only (no directories)
      const allFiles = (await AndroidSAF.listFiles({ directory: this.settings.recordingsDirectoryUri }))
        ?.items.filter(i => !i.isDirectory);

      // extract supported audio file types
      const audioFiles = allFiles.filter(i => this.settings.supportedTypes.includes(i.type));

      // parse each audio file and its corresponding (optional) metadata file
      const count = audioFiles.length;

      // no files?
      if (count > 0) {
        let i = 0;
        for (const file of audioFiles) {

          // send progress update
          this.refreshProgress.next(++i / count);

          // check if current audio file already exists in current DB
          const dbRecord = currentDB.find(r => r.audioFile === file.name);
          if (dbRecord) {
            // mark file as "unchanged" and continue
            dbRecord.status = 'unchanged';
            continue;
          }

          // check if audio file has a corresponding metadata .json file
          const metadataFileName = replaceExtension(file.name, '.json');
          const metadataFile = allFiles.find(i => i.name === metadataFileName);

          // add to currentDB
          currentDB.push(await Recording.createInstance(this.settings.recordingsDirectoryUri, file, metadataFile));

        }
      }

      // remove deleted files
      currentDB = currentDB.filter(r => r.status !== 'deleted');

      // update collection & cache
      this.recordings.next(currentDB);
      await this.save();
      this.refreshProgress.next(0);

    }
    catch(err) {
      console.error(err);
      this.mbs.showError({ message: 'Error updating cache', error: err });
      this.refreshProgress.next(0);
    };

  }

  /**
   * Deletes the given recording file and its optional JSON metadata
   */
  async deleteRecording(item: Recording) {

    // shared delete function
    const deleteFileFn = async (filename: string) => {
      try {
        await AndroidSAF.deleteFile({ directory: this.settings.recordingsDirectoryUri, filename: filename });
        return true;
      }
      catch(err) {
        this.mbs.showError({
          message: 'There was an error while deleting item: ' + filename,
          error: err,
        });
        return false;
      }
    }

    if (
      item && await deleteFileFn(item.audioFile)
      && item?.metadataFile && await deleteFileFn(item.metadataFile)
    ){
      // update DB
      this.recordings.next(this.recordings.value.filter(r => r !== item));
    }

  }

  /**
   * Show user the SAF directory selection dialog.
   * After successful selection, the DB is refreshed (clearing the cache).
   */
  async selectRecordingsDirectory() {

    const alert = await this.alertController.create({
      header: 'Select recordings directory',
      message: new IonicSafeString(
        `This app needs access to BCR recordings directory.

        If you click <strong>OK</strong>, Android will show you a directory selector.

        Select the recordings directory used by BCR and allow access to its content...`
        .replace(/[\r\n]/g, '<br/>')),
      buttons: [
        'Cancel',
        {
          text: 'OK',
          handler: () => {
            // show directory selector
            AndroidSAF.selectDirectory({})
              .then(async res => {
                console.log('Selected directory:', this.settings.recordingsDirectoryUri);
                this.settings.recordingsDirectoryUri = res.selectedUri;
                await this.settings.save();
                // try to load the DB from selected folder
                // (it will fallback to refreshContent() if database is missing)
                await this.load();
              });
          },
        },
      ],
      backdropDismiss: false,
    });

    await alert.present();
  }

  /**
   * Load recordings database from storage
   */
  private async load() {

    try {

      // test if DB file exists, then load it
      const readFileOptions = {
        directory: this.settings.recordingsDirectoryUri,
        filename: DB_FILENAME,
        encoding: Encoding.UTF8,
      };

      if ((await AndroidSAF.fileExists(readFileOptions)).exists) {
        const { content } = await AndroidSAF.readFile(readFileOptions);
        const dbContent: DbContent = JSON.parse(content);

        // check DB version
        if (dbContent.schemaVersion < DB_SCHEMA_VERSION) {
          this.upgradeDb(dbContent);
        }

        // return DB
        this.recordings.next(dbContent.data);
      }
      else {
        // refresh content
        await this.refreshContent();
      }

    } catch (error) {
      this.mbs.showError({
        message: 'Error loading database',
        error,
      });
    }

  }

  /**
   * Save the recordings database to storage
   */
  public async save() {

    try {

      // serialize data
      const content = JSON.stringify(<DbContent> {
        schemaVersion: DB_SCHEMA_VERSION,
        data: this.recordings.value,
      }, null, 2);

      // write content
      await AndroidSAF.writeFile({
        directory: this.settings.recordingsDirectoryUri,
        filename: DB_FILENAME,
        content: content,
        encoding: Encoding.UTF8,
      });

    } catch (error) {
      this.mbs.showError({
        message: 'Error saving database',
        error,
      });
    }

  }

  /**
   * Upgrade DB version
   */
  private upgradeDb(dbContent: DbContent) {

    // while (dbContent.schemaVersion < DB_SCHEMA_VERSION) {

    //   switch (dbContent.schemaVersion) {

    //     // upgrade ver. 1 --> 2
    //     case 1:
    //       dbContent.schemaVersion = 2;
    //       break;

    //       // upgrade ver. 2 --> 3
    //       case 1:
    //       dbContent.schemaVersion = 3;
    //       break;

    //   }

    // }

  }

}
