import nodemailer from 'nodemailer';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export function createMailSender(config) {
  if (config.mailTransport === 'smtp')
    return nodemailer.createTransport({
      ...config.smtp,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  const client = new SESv2Client(config.awsOptions);
  return {
    sendMail: (message) =>
      client.send(
        new SendEmailCommand({
          FromEmailAddress: config.mailFrom,
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: 'UTF-8' },
              Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
            },
          },
        }),
        { abortSignal: AbortSignal.timeout(20000) },
      ),
    close: () => client.destroy(),
  };
}
