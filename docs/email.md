# Email API

## Current Markketplace Direction (2026)

### Audience model: prefer fewer lists, more tags/segments

Recommended model:
- one primary list per store for marketing audience
- contact metadata for segmentation, for example:
  - source: buyer, event_rsvp, newsletter
  - event_document_id
  - product_document_id
  - store_document_id
  - purchase state flags
- SendGrid dynamic segments for campaigns and reminders

Why:
- scales better than creating one list per event forever
- easier cleanup and reporting
- supports queries such as bought-this-product-only, RSVP-for-this-event, high-value buyers

Current implementation note:
- RSVP sync currently uses per-event lists via the Tienda RSVP sync endpoint.
- This is acceptable short-term and can coexist with the tagged contact strategy during migration.

### Event reminder lifecycle

When event data changes:
- update reminder schedule records for that event
- recompute times for reminder windows, for example 24h and 1h before start

When event is unpublished or canceled:
- cancel pending reminder jobs for that event
- keep audit status in Strapi for observability

### Template system status and cleanup plan

Current status:
- there is a shared HTML email layout helper plus specialized builders
- template logic is spread across notification and SendGrid helper files, which can feel confusing

Target shape:
- src/services/email/
  - layout.ts: base shell and theme tokens
  - templates/
    - welcome.ts
    - rsvp-confirmation.ts
    - event-reminder.ts
    - order-confirmation.ts
    - store-order-notification.ts
  - renderer.ts: render(templateKey, payload, storeTheme)
  - delivery.ts: provider adapter (SendGrid today)

Migration rule:
- keep existing exported function names as wrappers until all callers are moved
- avoid breaking existing API responses or webhook-triggered sends

---

Choosing between Mailchimp and SendGrid depends on your specific needs for email services. Here’s a comparison to help you decide which might be better for your Strapi integration:

SendGrid
Pros:

Transactional Emails: SendGrid is highly focused on transactional emails, which are crucial for order confirmations, password resets, etc.
Developer-Friendly: Provides robust APIs, great documentation, and easy integration with backend services like Strapi.
Email Deliverability: Known for high deliverability rates.
Scalability: Suitable for both small-scale and large-scale email needs.
Cons:

Learning Curve: For users not familiar with email APIs, there might be a slight learning curve.
Cost: Depending on the volume of emails, the cost can increase.
Mailchimp
Pros:

Email Marketing: Mailchimp excels in email marketing with great tools for creating and managing campaigns.
All-in-One: Offers additional features like marketing automation, audience management, and detailed analytics.
User-Friendly: Easy-to-use interface for users who are not technically inclined.
Integration with E-commerce: Integrates well with e-commerce platforms for marketing campaigns.
Cons:

Transactional Emails: While Mailchimp does offer transactional email services through Mandrill, it’s primarily focused on marketing emails.
Pricing: Can become expensive as you add more features and contacts.
Decision Points
Transactional Emails: If your primary need is to send transactional emails (e.g., order confirmations, password resets), SendGrid is likely the better choice.
Email Marketing: If you need to run marketing campaigns and handle audience management, Mailchimp might be more suitable.
Ease of Integration: For a developer-friendly API and straightforward integration with Strapi, SendGrid might be easier.
Additional Features: If you need additional marketing features, Mailchimp provides a more comprehensive suite.
Ethical Considerations: Intuit vs. Twilio
Intuit: Known for its financial software products (TurboTax, QuickBooks), Intuit has faced criticism over its lobbying efforts and business practices, especially related to making tax filing more difficult to drive users to its paid services.
Twilio: Generally viewed as more developer-focused and transparent, though like any large company, it has had its share of controversies.
Conclusion
For integrating with Strapi to handle a marketplace that supports multiple vendors, SendGrid might be the better choice due to its strong focus on transactional email and ease of integration with backend services. However, if you need more comprehensive marketing features, Mailchimp could be considered, keeping in mind the additional complexity and cost.

If ethical considerations are a significant factor in your decision, Twilio (SendGrid’s parent company) might align more closely with your values compared to Intuit (Mailchimp’s parent company).







