export type EmailConfigInput = {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
};

const hostnamePattern = /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export function validateEmailConfigInput(input: EmailConfigInput, editing: boolean) {
  const errors: string[] = [];
  const checkHost = (label: string, value: string) => {
    if (!value.trim() || !hostnamePattern.test(value.trim())) errors.push(`${label} host is invalid.`);
  };
  const checkPort = (label: string, value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > 65535) errors.push(`${label} port must be between 1 and 65535.`);
  };

  checkHost('IMAP', input.imapHost);
  checkHost('SMTP', input.smtpHost);
  checkPort('IMAP', input.imapPort);
  checkPort('SMTP', input.smtpPort);
  if (!input.imapUser.trim()) errors.push('IMAP username is required.');
  if (!input.smtpUser.trim()) errors.push('SMTP username is required.');
  if (!editing && !input.imapPass) errors.push('IMAP password is required.');
  if (!editing && !input.smtpPass) errors.push('SMTP password is required.');

  return { ok: errors.length === 0, errors };
}
