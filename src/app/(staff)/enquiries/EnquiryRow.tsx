/** One row of the Leads list (the server page builds it; EnquiriesList renders it). */
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
  /** Gmail-style: true until a staff member opens the enquiry detail. Drives the bold row + nav dot. */
  unread: boolean
}
