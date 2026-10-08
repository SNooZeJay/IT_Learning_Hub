import { supabase } from './supabase/client'
import { humanizeError } from './errors'

/**
 * The names printed on a certificate.
 *
 * Read through `certificate_signatories`, not by joining profiles in the browser. That
 * function exists because Row Level Security will not let a student see the instructor
 * teaching them â€” `can_view_profile` covers themselves, admins, and their own students,
 * and nothing else â€” so a join here returns nothing and the certificate renders with
 * blank signature lines. It returns names only: no address, no phone, no profile id.
 *
 * The function is guarded on the caller holding the certificate, so this cannot be used
 * to ask about anybody else's.
 */

export interface CertificateSignatory {
  name: string
}

export interface CertificateDocument {
  certificateId: string
  certificateNumber: string
  finalPercentage: number
  issuedAt: string
  revokedAt: string | null
  revokeReason: string | null
  studentName: string
  courseTitle: string
  /** Only the instructors assigned to this course. Empty when none are recorded. */
  instructors: CertificateSignatory[]
  /** The platform administrator, or null when no active administrator exists. */
  adminName: string | null
}

export class CertificateError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'CertificateError'
  }
}

/**
 * Postgres and Storage wording, with the noise stripped.
 *
 * A certificate a student does not hold raises `insufficient_privilege` with a plain
 * sentence, which is the useful part and passes through.
 */
function messageOf(error: { message: string } | null, fallback: string): string {
  return humanizeError(error?.message ?? '', fallback)
}

/**
 * Everything a certificate document renders.
 *
 * Throws rather than returning null when the certificate cannot be read. The caller is a
 * page that either shows a certificate or explains why it cannot; a null here would have
 * to be turned into that same explanation by every caller separately, and one of them
 * would forget.
 */
export async function loadCertificateDocument(certificateId: string): Promise<CertificateDocument> {
  const { data, error } = await supabase.rpc('certificate_signatories', {
    p_certificate_id: certificateId,
  })

  if (error) {
    throw new CertificateError(
      messageOf(error, 'This certificate could not be read. Try again in a moment.'),
    )
  }

  // A null here means the function found a row it should not have: the guard in SQL
  // refused, so the browser got nothing. Reporting that as "no certificate" would tell a
  // student they have earned nothing, which is the opposite of what happened.
  if (!data) {
    throw new CertificateError('This certificate could not be read. Try again in a moment.')
  }

  return {
    certificateId: String(data.certificateId),
    certificateNumber: String(data.certificateNumber),
    finalPercentage: Number(data.finalPercentage),
    issuedAt: String(data.issuedAt),
    revokedAt: data.revokedAt ? String(data.revokedAt) : null,
    revokeReason: data.revokeReason ? String(data.revokeReason) : null,
    studentName: String(data.studentName),
    courseTitle: String(data.courseTitle),
    instructors: Array.isArray(data.instructors)
      ? data.instructors
          // The RPC returns `jsonb`, so the element type is `Json` rather than the shape
          // the function documents. Read through a narrow cast rather than trusting it: an
          // entry that is not an object, or whose `name` is missing, is dropped rather
          // than printed as "undefined" on a certificate.
          .map((entry) => ({ name: String((entry as { name?: unknown } | null)?.name ?? '') }))
          .filter((entry) => entry.name.length > 0)
      : [],
    adminName: data.adminName ? String(data.adminName) : null,
  }
}
