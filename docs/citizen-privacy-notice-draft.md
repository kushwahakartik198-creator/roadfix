# RoadFix Citizen Privacy Notice — Draft for Owner Approval

**DRAFT — DO NOT PUBLISH IN THE APPLICATION UNTIL APPROVED.** The bracketed contact details and unresolved policy choices below require owner review. This draft describes current application behavior in plain language; it is not a legal compliance statement.

## When you report a road issue

RoadFix collects the information you enter to describe and locate the problem. This can include the ward, issue category, description, location on the map, and a photograph you choose to upload. A photograph can show people, vehicle plates, homes, or other identifying details, so please include only what is needed to show the road issue.

Reporter name and contact information are optional where the form supports leaving them blank. If you provide them, they are stored as private complaint information. Do not include sensitive personal information in the public description.

RoadFix asks for a location so the report can be routed to the appropriate ward and staff can find the reported issue. A photograph may help authorized staff assess the road condition. The application removes certain image metadata during processing, but you should still avoid capturing unrelated personal details.

## Complaint references and tracking

After submitting a report, you receive a complaint reference. Keep it private and use it to check the complaint's reported status and history on the tracking page. Anyone who has the reference may be able to see that public tracking information, so do not post the reference publicly. Public tracking does not show private reporter contact information or private image files.

## Who may access report information

Authorized RoadFix administrators can manage complaints and staff. Officers can see limited summaries for unassigned complaints in their ward and operational details for complaints assigned to them. Authorized administrators and officers assigned to a complaint may access permitted private contact and photograph information for operational work. Access is controlled by the application, but stored files also depend on the security of the pilot computer, accounts, and backups.

## Storage and protection

The current RoadFix application stores data in a local SQLite database and stores uploaded photographs in a local folder on the RoadFix machine. It does not currently use Supabase for application data or authentication. Database and photo backup copies may contain the same personal information. The application does not encrypt individual database or backup files. Windows volume encryption and restricted file permissions are planned operational controls and must be verified on the actual pilot equipment; do not assume they are in place just because RoadFix is installed.

## Questions and concerns

For a privacy or data-handling question, contact **[OWNER-APPROVED PRIVACY CONTACT NAME / ROLE]** at **[OWNER-APPROVED PHONE OR EMAIL]**. Do not send photographs, contact details, passwords, or complaint references through an unapproved channel.

## Details requiring owner approval before publication

- The official project/operator identity and contact channel.
- Which staff roles may access complaint images and contact information in actual pilot practice.
- Resident complaint-data retention and deletion policy. No approved resident-data retention period is documented here.
- Whether the proposed backup retention schedule is approved. Backup retention is separate from complaint-data retention.
- Confirmed storage, encryption, and access-control measures on the pilot machine and backup media.
- Review and approval of the final notice wording and translation needs.
