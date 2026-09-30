
export type EnquiryRowData = {
  id: string
  number: string | null
  name: string
  event: string
  status: string
  waitingOn: string | null
  shootDate: string | null
  email: string
  phone: string | null
  convertedProjectId: string | null
  waitingMs: number
  createdMs: number

  unread: boolean
}
