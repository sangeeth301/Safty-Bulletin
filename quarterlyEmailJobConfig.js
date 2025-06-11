import { LightningElement, track, wire } from 'lwc';
import getActiveDrivers from '@salesforce/apex/DriverEmailConfig.getDriverEmailSchedules';
import getInactiveRecipients from '@salesforce/apex/DriverEmailConfig.getInactiveRecipients';
import activateRecipients from '@salesforce/apex/DriverEmailConfig.activateRecipients';
import sendEmailNow from '@salesforce/apex/DriverEmailConfig.sendSafetyBulletinEmails';
import getNextRunFormatted from '@salesforce/apex/DriverEmailConfig.getNextRunFormatted';
import deactivateDriver from '@salesforce/apex/DriverEmailConfig.deactivateDriver';
import rescheduleEmailJob from '@salesforce/apex/DriverEmailConfig.rescheduleEmailJob';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import uploadContentVersion from '@salesforce/apex/DriverEmailConfig.uploadContentVersion';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex'; // Import refreshApex
import getFilesList from '@salesforce/apex/DriverEmailConfig.getFilesList';
import removeFile from '@salesforce/apex/DriverEmailConfig.removeFile';

export default class QuarterlyEmailJobConfig extends LightningElement {
    @track selectedTemplate = 'Quarterly_Email';
    @track nextRun = '';
    @track recipients = [];
    @track wiredSchedulesResult; // Store wired result for recipients
    @track wiredNextRunResult; // Store wired result for nextRun
    @track isBulletinVisible = false;

    showBulletin() {
        this.isBulletinVisible = true;
    }

    

    @wire(getActiveDrivers)
    wiredSchedules(result) {
        this.wiredSchedulesResult = result; // Store the wired result
        if (result.data) {
            this.recipients = result.data.map(record => ({
                id: record.Id,
                name: record.Name,
                email: record.Email__c,
                status: 'Active',
                statusClass: 'slds-text-color_success'
            }));
        } else if (result.error) {
            console.error('Error loading schedules:', result.error);
        }
    }

    @wire(getNextRunFormatted)
    wiredNextRun(result) {
        this.wiredNextRunResult = result; // Store the wired result
        if (result.data) {
            this.nextRun = result.data;
            console.log('nextRun--->>>>>>>>>>>>>>>>>>>', result.data);
        } else if (result.error) {
            this.nextRun = 'Error fetching schedule';
            console.error('Apex Error:', result.error);
        }
    }

    @track columns = [
        { label: 'Name', fieldName: 'name', type: 'text' },
        { label: 'Email', fieldName: 'email', type: 'email' },
        {
            label: 'Status',
            fieldName: 'status',
            type: 'text',
            cellAttributes: { class: { fieldName: 'statusClass' } }
        },
        {
            type: 'action',
            typeAttributes: {
                rowActions: [
                    { label: 'de-activate', name: 'delete', iconName: 'utility:delete' }
                ]
            }
        }
    ];

    get recipientCount() {
        return this.recipients.length;
    }

    handleTemplateChange(event) {
        this.selectedTemplate = event.detail.value;
    }

    //------------------------------------------preview pdf--------------------------------------
    @track fileData;
    @track fileName = '';
    @track filePreviewUrl = '';
    @track showPreview = false;
    @track isPDF = false;
    @track isImage = false;
    @track isUnsupported = false;
    @track nameOfFile = '';
    @track showFileName = false;
    @track isUploading = false;
    @track isRemoving = false;
    fileObject;
    
    // Files list
    @track filesList = [];
    wiredFilesResult;

    // Wire method to get files list
    @wire(getFilesList)
    wiredFiles(result) {
        this.wiredFilesResult = result;
        if (result.data) {
            this.filesList = result.data;
        } else if (result.error) {
            console.error('Error fetching files:', result.error);
            this.showErrorToast('Failed to load files list.');
        }
    }

    get disablePreview() {
        return !this.fileData;
    }

    get saveButtonLabel() {
        return this.isUploading ? 'Uploading...' : 'Save';
    }

    get hasFiles() {
        return this.filesList && this.filesList.length > 0;
    }

    handleFileChange(event) {
        const file = event.target.files[0];
        if (file) {
            this.fileObject = file;
            this.nameOfFile = file.name;
            this.showFileName = true;
            
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                this.fileData = {
                    filename: file.name,
                    base64: base64,
                    fullDataUrl: reader.result
                };
            };
            reader.readAsDataURL(file);
            
            // Reset preview
            this.showPreview = false;
        }
    }

    handlePreviewClick() {
        if (!this.fileData || !this.fileObject) return;
        
        if (this.showPreview) {
            this.showPreview = false;
            return;
        }
        
        const fileName = this.fileData.filename.toLowerCase();
        
        this.isPDF = fileName.endsWith('.pdf');
        this.isImage = fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');
        this.isUnsupported = !this.isPDF && !this.isImage;
        
        if (this.isPDF) {
            this.filePreviewUrl = URL.createObjectURL(this.fileObject);
        } else if (this.isImage) {
            this.filePreviewUrl = this.fileData.fullDataUrl;
        }
        
        this.showPreview = true;
    }

    handleSave() {
        if (!this.fileData || this.isUploading) return;
        
        this.isUploading = true;
        
        uploadContentVersion({
            fileName: this.fileData.filename,
            base64Data: this.fileData.base64
        })
        .then(result => {
            console.log('Upload success:', result);
            this.showSuccessToast('File uploaded successfully.');
            this.removeSelectedFile();
            // Refresh the files list
            return refreshApex(this.wiredFilesResult);
        })
        .catch(error => {
            console.error('Upload failed:', error);
            this.showErrorToast('Failed to upload file.');
        })
        .finally(() => {
            this.isUploading = false;
        });
    }

    handleRemoveFile(event) {
        if (this.isRemoving) return;
        
        const fileId = event.target.dataset.fileid;
        const fileName = event.target.dataset.filename;
        
        if (!fileId) return;
        
        this.isRemoving = true;
        
        removeFile({ contentVersionId: fileId })
        .then(result => {
            if (result) {
                this.showSuccessToast(`File "${fileName}" removed successfully.`);
                // Refresh the files list
                return refreshApex(this.wiredFilesResult);
            } else {
                this.showErrorToast('Failed to remove file.');
            }
        })
        .catch(error => {
            console.error('Remove failed:', error);
            this.showErrorToast('Failed to remove file.');
        })
        .finally(() => {
            this.isRemoving = false;
        });
    }

    removeSelectedFile() {
        this.fileName = '';
        this.filePreviewUrl = '';
        this.showPreview = false;
        this.isPDF = false;
        this.isImage = false;
        this.isUnsupported = false;
        this.nameOfFile = '';
        this.showFileName = false;
        this.fileObject = null;
        this.fileData = null;
        this.isUploading = false;
        
        // Clear file input
        const fileInput = this.template.querySelector('lightning-input[type="file"]');
        if (fileInput) {
            fileInput.value = '';
        }
    }

    

    /*uploadFileToServer(fileName, base64Data, fileType) {
        return uploadContentVersion({
            fileName: fileName,
            base64Data: base64Data,
            fileType: fileType
        })
        .then(result => {
            console.log('Upload success:', result);
            this.showSuccessToast('File uploaded successfully.');
           
        })
        .catch(error => {
            console.error('Upload failed:', error);
            this.showErrorToast('Failed to upload PDF.');
            throw error; // so handleSave() can catch it
        });
    }*/


    /*handlePreviewClick() {
        if (!this.file) return;
        this.showPreview = !this.showPreview;
    }*/


    //------------------------------------------preview pdf--------------------------------------

    handleAddRecipient() {
        this.showModal = true;
        console.log('Add new recipient');
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;

        if (actionName === 'delete') {
            this.deactivateAndRemoveRow(row.id);
        }
    }

    deactivateAndRemoveRow(recordId) {
        deactivateDriver({ recordId })
            .then(() => {
                // Remove from recipients list
                this.recipients = this.recipients.filter(item => item.id !== recordId);

                   this.showSuccessToast ('Driver has been deactivated.');
                // Refresh the wired data
                return refreshApex(this.wiredSchedulesResult);
            })
            .catch(error => {
                console.error('Error deactivating driver:', error);
                    this.showErrorToast('Failed to deactivate driver.');
                 
            });
    }

    @track testEmail = '';

    handleManualEmailChange(event) {
        this.testEmail = event.target.value;
    }

    handleSendTestEmail() {
        console.log('email>>>>>>>>>>>',this.testEmail);
        if (!this.testEmail) {
            this.showErrorToast('Please enter a valid email address.');    
            return;
        }

        sendEmailNow({ toEmail: this.testEmail })
            .then(() => {
                this.testEmail = '';              
                this.showSuccessToast('Test email sent successfully.');               
            })
            .catch(error => {              
                this.showErrorToast('Failed to send test email: ' + error.body.message);                       
            });
    }

    handleCloseModal() {
        this.removeSelectedFile();
       this.isBulletinVisible = false;
    }

    // ...............................................................Handle inactive Driver///-------------------------------------

    @track showModal = false;
    @track inactiveRecipients = [];
    @track selectedRecipientIds = [];

    inactiveColumns = [
        { label: 'Name', fieldName: 'Name' },
        { label: 'Email', fieldName: 'Email__c' }
    ];

    handleAddRecipient() {
    this.showModal = true;
    this.inactiveRecipients = [];
    getInactiveRecipients({ cacheBuster: new Date().getTime() }) // Add cache-busting parameter
        .then(data => {
            this.inactiveRecipients = data;
        })
        .catch(error => {
            console.error('Error fetching inactive recipients', error);
            this.showErrorToast('Failed to fetch inactive recipients.');
        });
}

    handleRowSelection(event) {
        const selectedRows = event.detail.selectedRows;
        this.selectedRecipientIds = selectedRows.map(row => row.Id);
    }

    handleActivate() {
        if (this.selectedRecipientIds.length === 0) {
            return;
        }

        activateRecipients({ recipientIds: this.selectedRecipientIds })
            .then(() => {
                // Remove activated rows from modal list
                this.inactiveRecipients = this.inactiveRecipients.filter(
                    row => !this.selectedRecipientIds.includes(row.Id)
                );

                // Reset selection and close modal
                this.selectedRecipientIds = [];
                this.showModal = false;

                // Refresh the main recipients list
                return refreshApex(this.wiredSchedulesResult);
            })
            .catch(error => {
                console.error('Error activating recipients', error);
                this.showErrorToast('Failed to fetch active recipients.');
            });
    }

    handleCancel() {
        this.showModal = false;
    }

    // ...............................................................Handle inactive Driver///-----------------------

    //--------------------------------------------------------------reschedule DateTime-------------------------------
    @track showScheduleInput = false;
    @track newSchedule;

   handleChangeSchedule() { 
        this.showScheduleInput = !this.showScheduleInput;
    }

    

    handleDateTimeChange(event) {
        this.newSchedule = event.target.value; // ISO 8601 format
    }

    handleScheduleSave() {
        if (!this.newSchedule) {
            this.showErrorToast('Please select a valid date and time.');
            return;
        }

        rescheduleEmailJob({ newTime: this.newSchedule })
            .then(result => {               
                this.showSuccessToast(result);
                this.showScheduleInput = false;

                // Refresh the nextRun data
                return refreshApex(this.wiredNextRunResult);
            })
            .catch(error => {
                console.error(error);
                this.showErrorToast('Failed to reschedule.');

            });
    }

    //--------------------------------------------------------------reschedule DateTime-------------------------------

    showErrorToast(message) {
        const evt = new ShowToastEvent({
            title: 'File Upload Error',
            message: message,
            variant: 'error',
        });
        this.dispatchEvent(evt);
    }
    showSuccessToast(message) {
        const evt = new ShowToastEvent({
            title: 'Success',
            message: message,
            variant: 'success',
        });
        this.dispatchEvent(evt);
    }

    handleRefresh(){
        this.removeSelectedFile();
        this.testEmail = '';
        this.newSchedule ='';
    }

}