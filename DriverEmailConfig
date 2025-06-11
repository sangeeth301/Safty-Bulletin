public class DriverEmailConfig {
    
    @AuraEnabled(cacheable=true)
    public static List<Driver_Email_Schedule__c> getDriverEmailSchedules() {
        return [SELECT Id, Name, Email__c, Active__c 
                FROM Driver_Email_Schedule__c 
                WHERE Active__c = true];
    }
    
    @AuraEnabled(cacheable=true)
    public static List<Driver_Email_Schedule__c> getInactiveRecipients() {
        return [SELECT Id, Name, Email__c, Active__c 
                FROM Driver_Email_Schedule__c 
                WHERE Active__c = false ];
    }
    
    @AuraEnabled
    public static void activateRecipients(List<Id> recipientIds) {
        List<Driver_Email_Schedule__c> toUpdate = [
            SELECT Id 
            FROM Driver_Email_Schedule__c 
            WHERE Id IN :recipientIds
        ];
        
        for (Driver_Email_Schedule__c rec : toUpdate) {
            rec.Active__c = true;
        }
        if(!toUpdate.isEmpty()){
            update toUpdate;
        }
    }
    
    @AuraEnabled
    public static void deactivateDriver(Id recordId) {
        Driver_Email_Schedule__c record = [
            SELECT Id, Active__c FROM Driver_Email_Schedule__c WHERE Id = :recordId
        ];
        record.Active__c = false;
        
        update record;
        
    }
    
    
    
    
    
    public static List<Messaging.EmailFileAttachment> loadAttachments() {
    List<Messaging.EmailFileAttachment> attachments = new List<Messaging.EmailFileAttachment>();
    List<ContentVersion> usedVersionsToUpdate = new List<ContentVersion>();


    // Query ContentVersions with Saftly_Bulletin__c = true
    List<ContentVersion> versions = [
        SELECT Id, Title, VersionData, FileExtension, Saftly_Bulletin__c
        FROM ContentVersion
        WHERE Saftly_Bulletin__c = true
    ];

    // Loop through each and prepare attachments
    for (ContentVersion cv : versions) {
        try {
            Messaging.EmailFileAttachment attachment = new Messaging.EmailFileAttachment();
            attachment.setFileName(cv.Title + '.' + cv.FileExtension);
            attachment.setBody(cv.VersionData);

            // Set content type
            String ext = cv.FileExtension != null ? cv.FileExtension.toLowerCase() : '';
            if (ext == 'pdf') {
                attachment.setContentType('application/pdf');
            } else if (ext == 'png') {
                attachment.setContentType('image/png');
            } else if (ext == 'jpg' || ext == 'jpeg') {
                attachment.setContentType('image/jpeg');
            } else {
                attachment.setContentType('application/octet-stream');
            }

            attachments.add(attachment);
            System.debug('Attachment loaded: ' + cv.Title);

            // Only update Saftly_Bulletin__c if it was true originally
            if (cv.Saftly_Bulletin__c) {
                cv.Saftly_Bulletin__c = false;
                usedVersionsToUpdate.add(cv);
            }

        } catch (Exception e) {
            System.debug('Error with ContentVersion Id ' + cv.Id + ': ' + e.getMessage());
        }
    }

    // Update Saftly_Bulletin__c to false
    if (!usedVersionsToUpdate.isEmpty()) {
        try {
            update usedVersionsToUpdate;
            System.debug('Updated ContentVersions: ' + usedVersionsToUpdate.size());
        } catch (DmlException dmlEx) {
            System.debug('Error updating ContentVersions: ' + dmlEx.getMessage());
        }
    }

    return attachments;
}

    
    
    
    
    /*-------------------------------------------------------------------send Quarterly Emails-------------------------------------------------------------------------*/
    @AuraEnabled
    public static void sendQuarterlyEmails() {
        sendSafetyBulletinEmails(null);
        autoRescheduleEmailJob();        
    }
    
    @AuraEnabled
    public static void sendSafetyBulletinEmails(String toEmail) {
        try {
            // Get attachments
            List<Messaging.EmailFileAttachment> attachments = loadAttachments();
            
            // Email body
            String subject = 'Quarterly Safety Documents';
            String htmlBody = 
                '<p>Dear Driver,</p>' +
                '<p>Please find attached the latest <strong>Safety Bulletin</strong>. <br>' +
                'Kindly review the documents to stay updated on safety practices and handling procedures.</p>' +
                '<p>If you have any questions, feel free to reach out.</p>' +
                '<p>Thank you for your time and cooperation.</p>';
            
            // If a specific email address is provided
            if (String.isNotBlank(toEmail)) {
                Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
                mail.setToAddresses(new List<String>{ toEmail });
                mail.setSubject(subject);
                mail.setHtmlBody(htmlBody);
                mail.setFileAttachments(attachments);
                
                Messaging.SendEmailResult[] results = Messaging.sendEmail(
                    new Messaging.SingleEmailMessage[] { mail }, false
                );
                
                if (!results[0].isSuccess()) {
                    throw new AuraHandledException('Failed to send email: ' + results[0].getErrors()[0].getMessage());
                }
                
                System.debug('Email sent to single recipient: ' + toEmail);
            } else {
                // Bulk email to all active drivers
                List<Driver_Email_Schedule__c> activeDrivers = [
                    SELECT Name, Email__c
                    FROM Driver_Email_Schedule__c
                    WHERE Active__c = true AND Email__c != null
                ];
                
                if (activeDrivers.isEmpty()) return;
                
                List<Messaging.SingleEmailMessage> emailsToSend = new List<Messaging.SingleEmailMessage>();
                
                for (Driver_Email_Schedule__c driver : activeDrivers) {
                    Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
                    email.setToAddresses(new List<String>{ driver.Email__c });
                    email.setSubject(subject);
                    email.setHtmlBody(htmlBody.replace('Driver', driver.Name));
                    
                    // Clone attachments
                    List<Messaging.EmailFileAttachment> clonedAttachments = new List<Messaging.EmailFileAttachment>();
                    for (Messaging.EmailFileAttachment att : attachments) {
                        Messaging.EmailFileAttachment clone = new Messaging.EmailFileAttachment();
                        clone.setFileName(att.getFileName());
                        clone.setBody(att.getBody());
                        clone.setContentType(att.getContentType());
                        clonedAttachments.add(clone);
                    }
                    
                    email.setFileAttachments(clonedAttachments);
                    emailsToSend.add(email);
                }
                
                Messaging.sendEmail(emailsToSend, false);
                System.debug('Bulk emails sent to ' + emailsToSend.size() + ' drivers.');
            }
            
        } catch (Exception e) {
            System.debug('Error sending safety bulletin: ' + e.getMessage());
            throw new AuraHandledException('Email send failed: ' + e.getMessage());
        }
        
        
    }


    
    
    //=====================To get the Next trigger time----------------------------------------------------------------------
    
    @AuraEnabled(cacheable=true)	
    public static String getNextRunFormatted() {
        CronTrigger ct = [
            SELECT CronJobDetail.Name, NextFireTime
            FROM CronTrigger
            WHERE CronJobDetail.Name = 'Quarterly Driver Email Job'
            LIMIT 1
        ];
        
        if (ct.NextFireTime != null) {
            return ct.NextFireTime.format('MMM d, yyyy - h:mma');
        } else {
            return 'No next run scheduled';
        }
    }
    
    
    ////=======================================To set Schedule the class from the user input===============================
    //
    //
    @AuraEnabled
    public static String rescheduleEmailJob(DateTime newTime) {
        String jobName = 'Quarterly Driver Email Job';
        
        // Abort previous one-time job if any
        List<CronTrigger> existingJobs = [
            SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = :jobName
        ];
        
        for (CronTrigger job : existingJobs) {
            System.abortJob(job.Id);
        }
        
        // One-time run on user-selected date/time
        String cronExp = getCronExpression(newTime);
        System.schedule(jobName, cronExp, new QuarterlyDriverEmailJobSchedule());
        
        return 'One-time email job scheduled for: ' + newTime.format('MMM d, yyyy - h:mma');
    }
    
    public static String getCronExpression(DateTime dt) {
        return String.format('{0} {1} {2} {3} {4} ? {5}',
                             new String[] {
                                 String.valueOf(dt.second()),
                                     String.valueOf(dt.minute()),
                                     String.valueOf(dt.hour()),
                                     String.valueOf(dt.day()),
                                     String.valueOf(dt.month()),
                                     String.valueOf(dt.year())
                                     }
                            );
    }
    
    
    
    //===================================================================upload file====================================================
    
    
    @AuraEnabled
    public static Id uploadContentVersion(String fileName, String base64Data) {
        try {
            ContentVersion cv = new ContentVersion();
            cv.Title = fileName;
            cv.PathOnClient = '/' + fileName;
            cv.VersionData = EncodingUtil.base64Decode(base64Data);
            cv.Saftly_Bulletin__c = true; // Your custom field
            insert cv;
            return cv.Id;
        } catch (Exception e) {
            throw new AuraHandledException('Error uploading file: ' + e.getMessage());
        }
    }
    
    //================================================to set new schedule======================
    
    public static void autoRescheduleEmailJob() {
        String jobName = 'Quarterly Driver Email Job';
        
        // Abort previous one-time job if any
        List<CronTrigger> existingJobs = [
            SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = :jobName
        ];
        
        for (CronTrigger job : existingJobs) {
            System.abortJob(job.Id);
        }
        
        String cronExp = '0 0 9 1 1,4,7,10 ?'; // At 9:00 AM on the 1st of Jan, Apr, Jul, Oct
        System.schedule(jobName, cronExp, new QuarterlyDriverEmailJobSchedule());
        
    }
    
    
    
    @AuraEnabled(cacheable=true)
    public static List<ContentVersion> getFilesList() {
        try {
            return [
                SELECT Id, Title, VersionData, FileExtension, Saftly_Bulletin__c, CreatedDate
                FROM ContentVersion 
                WHERE Saftly_Bulletin__c = true 
                AND IsLatest = true
                ORDER BY CreatedDate DESC
                LIMIT 100
            ];
        } catch (Exception e) {
            System.debug('Get files error: ' + e.getMessage());
            throw new AuraHandledException('Error fetching files: ' + e.getMessage());
        }
    }
    
    
    
    @AuraEnabled
    public static Boolean removeFile(String contentVersionId) {
        try {
            if (String.isBlank(contentVersionId)) {
                throw new AuraHandledException('Content Version ID is required');
            }
            
            // Update the ContentVersion record
            ContentVersion cv = new ContentVersion(
                Id = contentVersionId,
                Saftly_Bulletin__c = false
            );
            
            update cv;
            
            return true;
            
        } catch (Exception e) {
            System.debug('Remove file error: ' + e.getMessage());
            throw new AuraHandledException('Error removing file: ' + e.getMessage());
        }
    }
    
    
}
