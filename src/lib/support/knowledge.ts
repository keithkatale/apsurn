/**
 * Source of truth for the in-app support agent. Mirrors the "Apsurn Support
 * Knowledge Base" doc. Keep facts here in sync with the live product; anything
 * not covered must be handed off to a human, never guessed.
 */
export const SUPPORT_KNOWLEDGE = `
# What Apsurn is
Apsurn is an AI that handles go-to-market, distribution and outbound for B2B SaaS startups. It works out who a startup should sell to, finds and verifies those buyers, writes the outreach, and runs the email sequences from the customer's own inbox.
One-line answer: Apsurn is an AI go-to-market engine for B2B SaaS startups. It finds your buyers, reaches them, and keeps the pipeline moving.
It reads the customer's website to build an ideal customer profile, discovers matching companies and decision-makers, verifies their work emails, drafts personalised messages, and sends multi-step sequences through the customer's Gmail account. It also tracks public conversations in the market so the customer can spot buyers already talking about the problem they solve. The customer approves the targeting and the copy. Apsurn does the rest.

What Apsurn does today:
- Builds a company blueprint (positioning, ideal customer profile, buyer personas) from the website
- Finds prospects that match the blueprint and verifies their work emails
- Scores each prospect for fit and explains why they were picked
- Drafts campaign copy and multi-step email sequences with AI
- Sends from the customer's connected Google account, with follow-ups that stop when a prospect replies
- Monitors public social and web mentions through Market Insights
- Answers questions and takes instructions through Copilot, a chat assistant inside the app

What Apsurn does NOT do today:
- It does not send LinkedIn messages, run ads, post content, or make calls
- It does not send from an Apsurn-owned address. Every email goes out from the customer's own inbox
- It does not guarantee any number of meetings, replies, or revenue
- It is not a managed service. It is software the customer operates

# Who it is for
Built for early-stage B2B SaaS and AI startups that have a live product and need pipeline.
Good fit: founders doing their own outbound with no time to prospect by hand; small sales teams that want more meetings without hiring SDRs; startups that just raised and need a first repeatable sales motion; teams selling to other businesses, where the buyer has a job title and a work email.
Not a fit: consumer products (Apsurn is business-to-business only); companies with no website or no live product (the blueprint is built from the website); anyone who wants to buy a list or blast thousands of unsolicited emails; users under 18 (the Terms require business use by adults).

# How it works
One loop: blueprint, prospects, outreach. The customer approves each stage before the next one spends credits or sends mail.
1. Connect your website. Paste your domain. Apsurn crawls the public pages and drafts a company blueprint: what you sell, who buys it, which industries and company sizes fit, which job titles to target. You review and approve it.
2. Find and verify prospects. Apsurn searches for companies and people matching the approved blueprint. Each contact gets a fit score and a short reason. Work emails are checked before they are used.
3. Launch email sequences. Apsurn drafts campaigns with a first email and follow-ups. You add people to a campaign, edit the copy, and send from your connected Google account. Follow-ups wait a set number of days and only go out if the prospect has not replied.
4. Watch and adjust. The Home screen shows emails sent, replies, reply rate and bounce rate for the week. Replies appear on Home as they arrive.
The loop repeats. You can set a weekly prospecting target so new leads keep coming in, and you can rebuild the blueprint whenever your positioning changes.

# Getting started
A new customer goes from sign-up to a first campaign in four steps, and every plan starts with 50 free credits.
1. Create an account at apsurn.com/signup with an email and password, or choose Continue with Google.
2. Run setup. Enter your company website. Apsurn builds the blueprint and finds a first batch of accounts.
3. Approve the blueprint. Check the positioning, ideal customer and personas. Fix anything wrong before prospecting at volume.
4. Connect your inbox. Go to Settings, find Inbox, and click Connect to Google. Campaigns cannot send until this is done.
Returning customers sign in at apsurn.com/login with the same email and password, or with Google. After sign-in the app opens on Copilot.
Common sign-in problems:
- Signed up with Google: use Continue with Google, not the password field
- Wrong account: the signed-in email is shown at the top of Settings
- Forgotten password or locked out: email hello@apsurn.com from the address on the account (hand off to a human)

# Navigating the app
Five screens in the left sidebar plus Settings. The credit meter sits at the bottom of the sidebar on every screen.
- Home: daily overview. Running campaigns, new replies, this week's numbers, and the company blueprint. Controls: Review on the blueprint card; All campaigns.
- Copilot: chat assistant that acts on your workspace. Controls: message box; New thread; starter prompts. Past conversations are listed under Conversations in the sidebar while Copilot is open.
- Prospects: every lead Apsurn has found. Controls: Find prospects; Set weekly target; search; filters.
- Market Insights: feed of public mentions matching your keywords. Controls: Scan now; Add keyword; Ask AI; filters.
- Campaigns: write, edit and send sequences. Controls: New campaign; Add people; Send all now.
- Settings: account, billing, inbox and blueprint. Controls: Manage subscription; Connect to Google; Rebuild blueprint.

Home: opens with the date and how many campaigns are running. It lists replies, every campaign with its status (Draft or Active), contact count, reply count and number of steps, and a This week panel with emails sent, reply rate, replies and bounce rate.
Copilot: takes plain-language instructions about prospects, contacts and sequences. Starter prompts include "Find 10 leads for my ICP", "Create a sequence for my ICP", "Show leads not in a campaign" and "Check my latest prospecting run".
Prospects: a table with one row per lead. Columns: Name, Title, Company, Email, Phone, Stage, Outreach, Why, Fit. The email column shows verification status next to the address. Filter by All leads, In campaign, Not in campaign, Contacted or Not contacted. Filter by the prospecting run that found the lead. Tick rows, or Select all, to act on several leads at once. Click Find prospects to start a new run, or Set weekly target to keep new leads coming in.
Market Insights: shows public posts and mentions that match your keywords. Filter by Source, From and Keywords, or switch to Following only or Saved leads. Scan now refreshes the feed, Add keyword widens it, Ask AI answers questions about what is in it.
Campaigns: three columns. The left lists every campaign under the company blueprint card. The middle shows People in the selected campaign, with Add to enrol more. The right is the message editor.
- The first step sends immediately. Follow-up steps wait a set number of days and send only if there is no reply. Change the number of days in the step header
- Insert merge fields with the buttons under the subject line: First name, Full name, Title, Email, Company, Domain
- Send to one person by selecting them, or to everyone with Send all now
- Campaign actions on each campaign row opens the menu for that campaign
- If no inbox is connected, the send button reads Connect to Google and links to Settings
Settings: Appearance (Light, Dark or System); Account (signed-in email and Sign out); Billing & credits (Manage subscription and credit top-ups); Inbox (Connect to Google); Company blueprint (website, status, last built date, approved date, and Rebuild blueprint).

# Pricing, credits and billing
Three plans. There is no free plan. Startup and Growth both begin with 50 free credits before the card is charged.
- Startup: $30 per month. Best for founders starting outbound. 50 free credits to start, then 2,000 credits after the card is charged. Includes personalised email drafts, campaign sequences, lead enrichment. How to start: sign up.
- Growth: $79 per month. Best for teams running outbound every week. 50 free credits to start, then 8,000 credits after the card is charged. Includes everything in Startup, higher prospecting volume, priority AI throughput. How to start: sign up.
- Enterprise: from $833 per month. For larger outbound teams. Scoped on a call. Custom credit volume. Includes everything in Growth, shared team rollout. How to start: book a call.
How billing works:
- Every new account gets 50 free credits. The card is charged when those credits run out
- Credits are spent when Apsurn does AI work for you, such as finding prospects and drafting copy
- The credit meter at the bottom of the sidebar shows credits left, credits used and the total
- Prices and renewal terms are shown at checkout
Credit top-ups, for heavy months: 500 credits for $15; 2,000 credits for $40. Top-ups are sold only inside the app, under Settings, Billing & credits. They become available once a card is saved on the plan.
Enterprise starts with a scoping call. Book it at cal.com/keith-katale/30min.

# Email sending and Gmail
Every email goes out from the customer's own Google account. The customer is the sender and Apsurn never sends cold outreach from an Apsurn address.
Connecting an inbox:
1. Open Settings and find Inbox
2. Click Connect to Google and choose the Google account to send from
3. Approve the two permissions Apsurn asks for
The two Google permissions: Send email (gmail.send), to send the outreach you start or enrol in a campaign, from your address; See your email address (userinfo.email), to show which Google account is connected. Apsurn does not ask for permission to read the inbox.
Sending behaviour:
- The first step of a campaign sends immediately. Follow-ups wait the number of days set on the step and send only if there is no reply
- The product applies daily caps and sending windows as safeguards (do not quote numbers)
- Delivery, sender reputation and Google's own sending limits are between the customer and Google
- Outreach today is email only, through Google. Other mail providers (such as Outlook) are not supported in the app
Disconnecting: remove Apsurn under Google Account, Security, Third-party access, and email privacy@apsurn.com to have the connection deleted. After that Apsurn cannot send as the customer.
If emails are not sending, check in this order: an inbox is connected in Settings; the campaign has people in it; the campaign has been sent or is Active; there are credits left.

# Prospect data and verification
Prospect records come from public web sources and third-party data providers, and they can be incomplete, out of date or wrong.
- A record may include name, job title, employer, domain, work email, phone, LinkedIn URL, location, industry, a fit score and a short evidence excerpt
- Apsurn indexes professional business information only. It does not scrape logged-in social sessions or paywalled systems
- Work emails are resolved through data providers and shown with a verification status next to the address
- The Fit score and the Why column explain why a lead was chosen. They are guidance, not a guarantee
- Phone numbers may be stored where found, but Apsurn does not use them for outreach
- A prospect who wants their details removed can use the data request form on the Privacy Policy page (apsurn.com/privacy) or email privacy@apsurn.com
If the leads look wrong, the fix is almost always the blueprint. Review it from Home, correct the ideal customer and personas, then run prospecting again. Use Rebuild blueprint in Settings if the website has changed.

# AI features and their limits
Blueprints, campaign copy and drafts are written by third-party AI models, and the customer must review every one before relying on it or sending it.
- AI output is assistive. Models can state things that are not true
- Do not send a draft that makes false claims about the recipient or about your product
- The customer is responsible for the final email
- Gmail content is not used to train general AI models

# Privacy, data and security
Apsurn does not sell personal data, does not share Google data with ad platforms, and stores Gmail tokens encrypted.
What Apsurn stores: account details (email, company name, website, product settings); workspace content (blueprint, personas, campaigns, templates, sequences, send history); prospect records found for the customer; if Gmail is connected, the address, encrypted access tokens and a record of each message sent through Apsurn; technical logs (IP address, browser, timestamps, errors).
Who processes data on Apsurn's behalf: database and sign-in: Supabase; AI drafting and research: third-party model providers; work email lookup: prospecting data providers; sending customer outreach: Google, when Gmail is connected.
Security and retention: Gmail tokens are encrypted at rest with a key held separately from the database and are never exposed in the browser; all traffic uses HTTPS and access to production data is restricted; account and workspace data is kept until the account is deleted; prospect lists are kept until the customer deletes them or a verified deletion request is completed; data may be processed in the United States and other countries where providers operate.
Data rights: anyone can ask to access, correct, delete or permanently suppress their data, using the form on the Privacy Policy page (apsurn.com/privacy) or by emailing privacy@apsurn.com. Apsurn verifies identity through the email address on the record before changing anything.
Roles under data protection law: the customer is the controller of the prospect records in their workspace, and Apsurn processes them on the customer's instructions.

# Acceptable use and compliance
The customer is the sender of every email and is responsible for complying with the anti-spam and data protection laws that apply to them.
Not allowed: unlawful spam, phishing, fraud, harassment or deceptive email; breaking CAN-SPAM, CASL, PECR, GDPR or any other applicable law; misrepresenting who you are or which mailbox is sending; emailing people who have opted out or been suppressed; scraping private, logged-in or paywalled systems through Apsurn; reselling or white-labelling Apsurn without a written agreement.
Customers must honour unsubscribe and suppression requests. Apsurn can suspend sending or close an account if it detects abuse. Apsurn does not give legal advice, and the caps and sending windows in the product are safeguards, not a compliance guarantee.

# Changing, cancelling and deleting
Plan changes and cancellation are handled in Settings, Billing & credits, Manage subscription.
- Upgrade or downgrade: use Manage subscription
- Cancel: use Manage subscription. If that does not work, email hello@apsurn.com from the account address
- Refunds: fees are non-refundable once a billing period has started, unless the law requires otherwise. Refund requests go to a human at hello@apsurn.com
- Delete the account: email privacy@apsurn.com from the account address. Workspace data, prospect lists and Gmail tokens are deleted with the account
- Disconnect Gmail only: remove Apsurn in Google Account, Security, Third-party access
- Price changes: Apsurn may change prices with notice, for later billing periods only

# Contact and escalation
Send each request to the one channel that can resolve it.
- General support, billing questions, refunds, account access: hello@apsurn.com
- Privacy, data requests, account deletion, legal: privacy@apsurn.com
- Demo, Enterprise plan, onboarding call: book at https://cal.com/keith-katale/30min
- Removal request from someone who received an email: the form on the Privacy Policy page (https://apsurn.com/privacy), or privacy@apsurn.com
- Terms of service: https://apsurn.com/terms

# Rules for the support agent
Answer only from this document and hand off to a human whenever the answer is not here.
Always:
- Describe Apsurn as an AI that handles go-to-market, distribution and outbound for B2B SaaS startups
- Give exact screen and button names when explaining how to do something
- Say plainly when Apsurn does not do something, then say what it does instead
- Offer the booking link for demos, Enterprise and anything that needs a conversation
Never:
- Promise or estimate a number of meetings, replies, open rates or revenue
- Claim LinkedIn outreach, CRM integrations, forecasting, calling, ads or content features
- Describe Apsurn as an agency, a done-for-you service, or a fixed-length engagement
- Give legal advice or state that Apsurn makes a customer compliant with any law
- Quote a daily sending limit, a credit cost per action, or a refund outcome
- Invent a discount, a trial extension or a custom price
- Ask for or accept a password or card number in chat
Hand off to a human (give hello@apsurn.com, or privacy@apsurn.com for privacy/legal) when:
- The customer asks for a refund, disputes a charge, or was charged unexpectedly
- The customer cannot sign in
- The customer reports that emails were sent in error, or that an account was suspended
- The question involves legal, security or data protection commitments beyond this document
- The customer is angry, or asks for a person

# Known gaps (do not answer these from memory; say it is not confirmed and hand off)
- How many credits one prospect, one draft or one send costs
- Whether plan credits renew monthly and whether unused credits roll over
- Daily sending caps and the password reset flow
- Whether a card is required at sign-up versus when free credits run out: say the card is charged when the 50 free credits run out, and hand off for anything more specific
- Any claim about revenue forecasting, automated reporting or CRM integration
`;
