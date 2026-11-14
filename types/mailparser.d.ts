declare module 'mailparser' {
  interface EmailAddress {
    address?: string
    name?: string
  }

  interface EmailAddressGroup {
    value: EmailAddress[]
    text: string
    html?: string
  }

  interface Attachment {
    filename?: string
    contentType: string
    content: Buffer
    size: number
    contentDisposition?: string
    checksum?: string
    related?: boolean
    contentId?: string
    headers?: Record<string, string>
  }

  interface ParsedMail {
    messageId?: string
    subject?: string
    from?: EmailAddressGroup
    to?: EmailAddressGroup
    cc?: EmailAddressGroup
    bcc?: EmailAddressGroup
    date?: Date
    receivedDate?: Date
    text?: string
    html?: string
    attachments?: Attachment[]
    headers?: Map<string, string>
  }

  function simpleParser(
    source: Buffer | string | Stream,
    options?: Record<string, unknown>
  ): Promise<ParsedMail>

  export { simpleParser, ParsedMail, Attachment, EmailAddressGroup }
}
