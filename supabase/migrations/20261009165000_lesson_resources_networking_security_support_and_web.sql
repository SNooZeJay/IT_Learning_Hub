-- Lesson resources for networking, security, IT support and web fundamentals.
--
-- Every external link points at a stable, published source: RFC 791 for IP, the IANA
-- service-name registry for port numbers, the Python and pandas documentation, MDN for
-- the web platform, and CompTIA's own certification pages. Two video links, both to
-- long-lived canonical pages rather than to a specific upload that could disappear.

begin;

insert into public.lesson_materials
  (lesson_id, title, file_path, material_type, content_text, external_url, position, uploaded_by)
select l.id, v.mat_title, null,
       v.mat_type::public.material_type, v.mat_content, v.mat_url, v.pos,
       c.created_by
from (values
('Packets, addresses and the postal analogy',1,'The parts of a packet','text',
$q$SOURCE      where it came from
DESTINATION  where it is going
SEQUENCE     which piece this is, so they can be put back in order
PAYLOAD      the actual content
TTL          how many hops it may survive before being dropped

Independent, numbered and self-contained: a router forwards one packet without
knowing anything about the ones before or after it. That is what lets them
route around a congested path, and it is also why a partly failed transfer
looks incomplete rather than absent.
$q$,null),
('The layered model, and why layers exist',1,'Reference: Internet Protocol, RFC 791','external_link',
null,'https://www.rfc-editor.org/rfc/rfc791'),
('Ethernet, Wi-Fi and the last hop',1,'Reference: Networking Basics, Cisco NetAcad','external_link',
null,'https://www.netacad.com/courses/networking-basics'),
('IP addresses and what they identify',1,'Reading an address with its prefix','code',
$q$An address on its own is half an address. The prefix length says where the
network part stops and the host part begins.

192.168.10.50/24   -> network 192.168.10.0,    host 50
10.0.5.7/16        -> network 10.0.0.0,       host 5.7
172.16.4.9/28      -> network 172.16.4.0,     hosts .1 to .14

Write addresses down with the prefix attached. Forgetting it is what produces
subnetting mistakes, because the same number means different things under a
different prefix.

One interface, one address. A laptop with Wi-Fi and Ethernet has two, and each
is reachable in its own right.
$q$,null),
('Subnetting without fear',1,'Subnetting arithmetic on one line','code',
$q$A /24 gives 8 host bits -> 254 usable hosts.

Split it in two:  /25 gives 7 host bits -> 126 hosts each  -> 2 subnets
Split it in four: /26 gives 6 host bits ->  62 hosts each  -> 4 subnets

The method that works every time:
  1. how many subnets do I need?
  2. how many hosts does each one have to hold?
  3. only then pick the prefix

The rule that fixes most real-world faults:
  the interface, its subnet, its default gateway and its DNS server
  all belong to the same subnet.

A gateway you cannot reach directly is the most common network fault there is,
and this one line explains it.
$q$,null),
('Ports: many services, one address',1,'Reference: IANA service name and port numbers','external_link',
null,'https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.xhtml'),
('DNS: turning names into addresses',1,'What the resolver is asked, and what it returns','text',
$q$QUERY     "what is the address for example.com?"
ANSWER    an address, plus the number of seconds it may be cached

The lookup usually walks down: the resolver answers from cache, or asks a root
server, which points at a top-level domain server, which points at the
authoritative server for that name.

Two failure modes, and the second one is far worse:
  - the name does not resolve at all  -> obvious, and gets reported
  - the name resolves to the WRONG address -> everything looks like it works

Blocking by name stops resolution. Blocking the resolved address stops the
connection but leaves the lookup succeeding, which is why the two are not
interchangeable.
$q$,null),
('Routers and default gateways',1,'The one question a router asks per packet','code',
$q$For each packet:

  is the destination inside a network I am directly attached to?
      yes -> send it out that interface
      no  -> send it to the next hop in the routing table
      no match at all -> drop it, and tell the sender

The default route is the catch-all entry: send it here if nothing more
specific matches.

On your own machine, the default gateway is the address of the router your
device sends everything unrecognised to.

Diagnosis follows from this directly: a device that reaches its gateway and
its DNS but nothing beyond is failing at routing, or at whatever sits beyond
it. Knowing the first hop works is what stops you restarting the machine.
$q$,null),
('A method for finding where a connection breaks',1,'The diagnostic checklist','text',
$q$Work outward, one layer at a time, confirming each before moving on.

  [ ] 1. Is the interface up, and does it have an address?
  [ ] 2. Can the device reach its own gateway?
  [ ] 3. Does the name resolve? To WHICH address?
  [ ] 4. Can it reach that address?
  [ ] 5. Is the port open?
  [ ] 6. Does the service answer?

The first one that fails is the fault. Two rules keep the result honest:

  change ONE thing, then retest, so you know what the change did
  write down what you observed, because the next person was not watching
$q$,null),
('The CIA triad and how it is actually used',1,'Reference: CompTIA Security+ certification','external_link',
null,'https://www.comptia.org/educators/certification/security'),
('The CIA triad and how it is actually used',2,'Three properties, three different failures','text',
$q$CONFIDENTIALITY - only the right people can read it
  fails by DISCLOSURE
  controls: authentication, authorisation, encryption

INTEGRITY - nobody can change it undetected
  fails by UNDETECTED CHANGE
  controls: hashing, digital signatures, audit logs, version control

AVAILABILITY - the people who need it can reach it
  fails by TAKING IT AWAY
  controls: redundancy, capacity, recovery, rate limiting

The controls differ in KIND, not just in strength. Confidentiality is about
identity. Integrity is about DETECTION. Availability is about CAPACITY.

Most real incidents are availability incidents. Nobody has to break into
anything to make a system unavailable: filling a disk or exhausting a
connection pool is enough. A programme that only thinks about confidentiality
will be surprised.
$q$,null),
('Risk, threats, vulnerabilities and controls',1,'The four words, kept apart','text',
$q$VULNERABILITY  a weakness
THREAT         anything that might exploit it
RISK           likelihood x damage
CONTROL        what you put in to reduce it

Keeping these apart is most of what makes the rest of the material make sense:

  patching a vulnerability        addresses the WEAKNESS
  awareness training              addresses the THREAT (a person being tricked)
  a firewall                      addresses neither - it lowers EXPOSURE

RISK is the only one that is a judgement, and the only one that decides where
effort goes. Two systems can carry the same vulnerability and face completely
different risk: one is reachable from the internet and holds something
valuable, the other is neither.

So you cannot reduce every risk. You rank them, spend against the ranking, and
accept some deliberately rather than by accident.
$q$,null),
('Zero trust and least privilege',1,'The reversal, stated plainly','text',
$q$LEAST PRIVILEGE
  a person or process gets only the access their job requires, and no more.
  Access that is not required is not harmless - it is a standing invitation.

ZERO TRUST
  never trusting by POSITION. Verify every request regardless of where it
  came from. It does not mean trusting nobody.

This reverses the older model, where being inside the perimeter was the
assumption and everything outside was suspect.

Perimeters leak. Once one device inside is compromised, the old model treats
everything it touches as trusted. Verifying every request removes that single
point of failure.

In practice the two only work together. You cannot hand out narrow permissions
safely unless you are checking who is asking on every request.
$q$,null),
('Malware: what each kind does',1,'Telling the categories apart','text',
$q$VIRUS      attaches to a file; needs something to carry it
WORM        copies itself across a network, on its own
TROJAN      looks like what you wanted, does something else
RANSOMWARE  encrypts, then demands payment, usually threatening destruction
SPYWARE     watches and reports
ROOTKIT     hides its own presence from the tools that would reveal it

Two things are true across all of them:

  1. Malware is overwhelmingly delivered as ordinary software somebody chose
     to install.
  2. It is overwhelmingly ransomware, because it monetises directly.

Defence therefore leans less on blocking the file and more on limiting what
it can reach, what it can change, and how fast you would notice.
$q$,null),
('Social engineering and the human layer',1,'Why technology controls do not help here','text',
$q$The attacker is not breaking in. They are being let in.

PHISHING          mass, untargeted
SPEAR PHISHING    targeted at one person, with details that make it convincing
PRETEXTING        invents a plausible reason to ask for something
TAILGATING        follows someone through a controlled door

What makes it work is that it exploits helpfulness and urgency, both of which
are good traits. A request that is urgent and slightly unusual makes people
act before they check, and that is precisely the window it needs.

Defences are unglamorous and effective:
  - verify through a SECOND channel, not the one the request came from
  - a deliberate delay before acting on anything asking for credentials or money
  - a culture where checking reads as careful, not as unhelpful
$q$,null),
('Network attacks you must recognise',1,'On-path, denial of service and replay','code',
$q$ON-PATH (the attacker sits between you and the destination)
  sniffing        reads traffic as it passes
  man-in-the-middle  alters traffic as it passes

DENIAL OF SERVICE
  flood           overwhelms the target with traffic
  distributed     the same, from many sources
  amplification   uses servers that reply to spoofed requests, so the target
                  receives far more than was ever sent

REPLAY
  captures legitimate traffic and sends it again later
  -> this is why freshness matters in authentication

PASSWORD ATTACKS, in roughly the order they are tried
  1. common passwords
  2. passwords reused from a breach elsewhere
  3. spraying a few common passwords across many accounts
  4. brute force, one account, exhaustively

SYN FLOOD exploits an asymmetry: the server allocates state on a half-open
connection while the sender costs almost nothing. That asymmetry is where most
denial of service comes from.
$q$,null),
('Hardening, logging and monitoring',1,'Hardening checklist and what detection is for','text',
$q$HARDENING - remove what is not needed, so there is less to attack
  [ ] close unused services
  [ ] change every default credential
  [ ] limit access to what is needed
  [ ] keep patch levels current

Hardening alone is never enough, because people and software both get things
wrong after you finish it. That is what detection is for.

LOGGING AND MONITORING answer a different question:
  not "how do we stop it" but "how quickly do we find out"

  - centralise logs: an attacker who reaches a machine can edit its local ones
  - alert on what indicates real trouble (authentication failures, privilege
    changes), not on everything

Time is the real measure. Minutes to notice versus weeks is almost entirely
the difference in how quickly somebody noticed.
$q$,null),
('Incident response in order',1,'The six steps, and the mistake everyone makes','text',
$q$1. PREPARATION   plan, reachable contacts, tested backups, working tools
                    (all of it BEFORE anything happens)
2. DETECTION      what happened, and how far did it get
   ANALYSIS
3. CONTAINMENT    stop it spreading; a deliberate trade of some availability
                   for less damage, decided under pressure with partial information
4. ERADICATION    remove the cause: malware, compromised accounts, entry route
5. RECOVERY       restore from known-good backups, then watch closely
6. LESSONS        feed back into preparation

The most common real-world failure is skipping step 4 and going straight to
recovery. It is always done for understandable reasons under time pressure, and
it is how an incident returns, sometimes weeks later.
$q$,null),
('The exam: domains, question types and tactics',1,'CompTIA Security+ exam information','external_link',
null,'https://www.comptia.org/educators/certification/security'),
('Hardware you will actually meet',1,'Failure signatures worth memorising','text',
$q$STORAGE
  fails SLOWLY. A drive with bad sectors reads almost everything and fails on
  particular files, so you get specific documents refusing to open rather than
  an obvious error. A solid state drive usually stops entirely, with no warning.

MEMORY
  INTERMITTENT by nature. Crashes at particular times or with particular apps.
  The machine may PASS a memory test on the second run, which is what makes
  these so frustrating.

OVERHEATING
  looks like every other fault and is the most often misdiagnosed one.
  Presents as random shutdowns under load. Cause: dust, a failed fan,
  a blocked vent.

POWER SUPPLY
  fails as if EVERYTHING failed at once, because the whole machine dies rather
  than one part. The parts are not the parts. The supply is.

These turn a vague report into a hypothesis, which is the difference between
testing and guessing.
$q$,null),
('Operating systems and the software on top',1,'Why permissions explain most software faults','code',
$q$Applications do not touch the disk or the network directly. They ask the
operating system, which is why a PERMISSION problem appears in the application
and is really an operating system problem.

  a file will not open        -> often permissions
  an app will not start       -> often a corrupt setting, not a corrupt program
  a machine will not update   -> usually something holding a file open

The distinction changes what you do. Software faults are reversible and cheap
to try, so support should EXHAUST software causes before suspecting hardware.
Doing it the other way round costs more and finds less.
$q$,null),
('Documentation, assets and ticketing',1,'The four fields a ticket needs','text',
$q$  who is affected
  what they OBSERVED (not what they concluded)
  when it started
  what was already tried

The last field is the one most often left empty and the most valuable, because
it stops the next person repeating work that has already been done.

Write for the reader who is not you:
  "made no difference"   tells them where NOT to look
  "did not work"         does not

Documentation is what makes a support desk work rather than become a
bottleneck of one experienced person. A fix that lives with one person is a
fix that will be rediscovered from scratch next term.
$q$,null),
('A repeatable diagnostic method',1,'The method, in order','text',
$q$  1. CONFIRM the symptom before changing anything.
     what was observed, when it started, what changed just before.
     Half of all tickets are solved by learning nothing changed.

  2. STATE one hypothesis. Not several. Two simultaneous changes and a success
     tell you nothing about which mattered, and you have learned nothing.

  3. TEST the cheapest thing that would DISTINGUISH between your hypotheses.
     Not the thing most likely to fix it. The thing that tells you if you
     were right.

  4. RECORD what you did and what happened, INCLUDING the attempts that failed.
     That record stops the next person starting where you started.

The method matters more than any specific fix, because the fixes change with
every platform and the method does not.
$q$,null),
('Common hardware faults',1,'Confirm before you replace','text',
$q$NO POWER AT ALL  -> supply, cable, or switch.
  Test with something known to work FIRST. The cheap explanations are correct
  far more often than people expect.

POWERS ON, RESTARTS IMMEDIATELY  -> very often memory.
  Remove one module at a time. If it runs on half, you have found the fault
  and you also know the machine is not entirely dead.

RUNS HOT AND SHUTS DOWN  -> ventilation.
  Confirm the temperature before opening anything. Check the fans actually
  spin. That costs nothing and it is the fix surprisingly often.

STORAGE FAULTS  -> check drive health BEFORE reinstalling anything.
  Reinstalling onto a failing drive destroys the evidence and costs an
  afternoon.

THE RULE: confirm before replacing. Parts swapped by guesswork leave the
machine in a worse state than when it arrived.
$q$,null),
('Common software faults',1,'The three questions that solve most of these','code',
$q$1. "It worked yesterday."
   What was installed or updated most recently?  Check this FIRST.
   The answer is usually there and it costs one question.

2. "It will not start."
   Try clearing the configuration or resetting the user profile.
   Safe, fast, and resolves a large share of these.

3. "It is slow."
   Look for several small causes, not one big one. They accumulate because
   each was individually below the threshold where anyone acted on it.

About "malware": it is the most OVER-reported fault in support. A large share
of reports are pop-ups the person agreed to install. That is a training
problem, not a technical one, and the fix is the same in both cases.
$q$,null),
('Asking questions that find the fault',1,'Open questions and closed questions','text',
$q$USEFUL  "What were you doing when it happened?"
USELESS  "Can you reproduce it?"

The open version invites the detail that identifies the fault. The closed
version can only ever produce yes or no.

FOUR QUESTIONS resolve most ambiguity in one exchange:
  what they saw, on which device, when it started, what changed just before

And ask about SCOPE early:
  only this machine, or several?   one user, or everyone?   any workaround?
The answers usually identify the layer straight away, and they take thirty
seconds to obtain.

Never make the reporter feel they are being blamed for the fault. The fastest
way to get a useful answer is for the person to believe it is worth giving.
$q$,null),
('Writing a fix someone else can follow',1,'What a handoff note should contain','text',
$q$  what you changed, in plain words
  what you DELIBERATELY did not change, and why
     -> stops the next person redoing the experiment you ruled out
  the verification: what you OBSERVED that told you it worked
     -> not "the fix worked". Otherwise nobody can tell whether a later
        problem is the same problem returning

Put it in the ticket, not in your head and not in a private note.

A record of a fix has two readers: the person who asked, who needs a
confirmation, and whoever gets the same ticket next month, who needs a method.

This is unglamorous work, and it is most of what makes a support desk
consistent rather than dependent on whoever is on shift.
$q$,null),
('Preventing the same ticket twice',1,'Which problems are worth eliminating','text',
$q$Solving a ticket   and   eliminating a ticket  are different jobs.
Only the second one scales.

NOT worth eliminating:
  a genuinely broken cable is a broken cable

WORTH eliminating - the same cause keeps producing new tickets:
  the same unsupported software installed on three machines by three people
  -> training, a deployment policy, or distributing the supported version
     solves it permanently. None of those is a hardware repair.

Look for patterns ACROSS tickets, not within one:
  one ticket is an incident
  the same ticket from three people is a process that is failing

After a batch of related tickets, ask what would have stopped them happening,
and do it even though nobody is waiting on it any more. It is the only work in
support that reduces the queue rather than keeping pace with it.
$q$,null),
('What HTML is for',1,'Reference: MDN, HTML','external_link',
null,'https://developer.mozilla.org/en-US/docs/Web/HTML'),
('What HTML is for',2,'Structure, style and behaviour','code',
$q$HTML describes WHAT a piece of content IS.
CSS describes HOW it should LOOK.
JavaScript describes HOW it BEHAVES.

Three languages, three separate decisions. Mixing them makes each one harder.

HTML arrives first. The browser builds a tree of elements from it, and
everything else happens afterwards. Neither styling nor scripting adds
MEANING, because meaning was already decided by the markup.

A page whose structure is wrong cannot be rescued by styling, because there
is nothing correct to style.
$q$,null),
('Elements, attributes and nesting',1,'Reference: MDN, HTML elements','external_link',
null,'https://developer.mozilla.org/en-US/docs/Web/HTML/Element'),
('Elements, attributes and nesting',2,'The nesting mistakes','code',
$q$<a> CANNOT CONTAIN AN <a>.
Wrapping a whole card in an anchor to make it clickable produces TWO
overlapping links fighting over the click.

AN UNCLOSED TAG is the most common beginner error. Content ends up in the
wrong place further down the page, which is confusing to debug because the
symptom is nowhere near the cause.

SOME ELEMENTS ONLY MAKE SENSE INSIDE ANOTHER. The browser will not always tell
you when you get it wrong; it renders something, quietly, that is not what you
meant.

Use the validator. It catches all of these in seconds, including the ones that
render correctly today and break in a browser you have not tried.
$q$,null),
('Semantic markup and why it matters',1,'The element that says what it is','code',
$q$WRONG                          RIGHT
-----                            -----
<div class="title">             <h2>
<div class="nav">               <nav>
<div class="list">              <ul> / <ol>
<div onclick="go()">            <button>
<div class="subtitle">          <p>

Using the right tag is also FASTER, because you are removing work:
  <nav>   is already a landmark
  <button> is already focusable and already announces itself as a button
  <ul>    already behaves like a list

A document built from divs describes nothing to anyone but you.
If no element fits, that is information: the CONTENT needs thinking about,
not the markup.
$q$,null),
('Selectors and the cascade',1,'Why your rule is being ignored','text',
$q$Cascade order, highest priority first:
  1. origin and importance  (author "important" beats user-agent styles)
  2. SPECIFICITY
  3. source order (later wins, at equal specificity)

Specificity is worth internalising because it is THE reason a rule you wrote
is being ignored. Something more specific is winning, and no amount of editing
your rule changes that.

THE HABIT THAT AVOIDS MOST OF THIS PAIN:
  keep specificity flat and let ORDER do the work.

  one class selector throughout a stylesheet    easy to reason about
  descendant selectors nested three deep        not, and they break the
                                               moment the markup changes

Classes are for WHAT something is. Identifiers are for the one genuinely unique
thing, and there is rarely one. Reaching for an identifier to win a
specificity fight is the most common reason stylesheets become unmaintainable.

When a rule is not applying: INSPECT which rule actually won. The browser will
tell you, and it turns a puzzle into a fact.
$q$,null),
('The box model and layout',1,'Reference: MDN, CSS box model','external_link',
null,'https://developer.mozilla.org/en-US/docs/Web/CSS/box_model'),
('The box model and layout',2,'Choosing a layout method','text',
$q$Every element is a box: content -> padding -> border -> margin.

The detail that catches everyone: whether padding and border count TOWARD the
size you specify. One setting ADDS them to the width, so a width means what
you think it means. Another INCLUDES them, so the same width produces
something visibly narrower.

WHICH METHOD ANSWERS WHICH QUESTION
  normal flow  one after another in document order.
              Correct far more often than people assume.
  flexbox      ONE direction: a line or a column.
              Navigation bars, card rows.
  grid         TWO dimensions at once. Page layouts.

LEARN THEM IN ORDER: normal flow, then flexbox, then grid.
Reaching for grid first usually produces a layout that is harder to change
later than one built in order.
$q$,null),
('Responsive design',1,'Reference: MDN, CSS media queries','external_link',
null,'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries'),
('Responsive design',2,'Why one shrinking layout fails','code',
$q$Responsive design is NOT one layout that shrinks.
It is one layout PER SIZE RANGE, chosen deliberately.

A wide-screen design squeezed into a narrow one fails badly because the
elements have nowhere to go. The fix is a DIFFERENT ARRANGEMENT, not a
smaller version of the same one.

TWO TOOLS DO MOST OF THE WORK
  relative units  - sizes against the container, not absolute pixels
  media queries   - different rules below a chosen width

ACCESSIBILITY REQUIREMENT BEHIND IT: support text zoom and respect the user
font-size preference. A layout that breaks when someone enlarges their browser
text is not responsive, it is merely rearranging for small screens.

Test by actually resizing, AND test by enlarging text.
Reading the layout on a narrow window is not the same as using it on a phone.
$q$,null),
('The DOM: the page as an object',1,'Reference: MDN, Document Object Model','external_link',
null,'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Document_Object_Model'),
('The DOM: the page as an object',2,'Selecting and holding on to elements','code',
$q$const search = document.querySelector(".search-box");
const items   = document.querySelectorAll(".item");

// Keep a reference. Look elements up ONCE and hold on to them.
search.addEventListener("input", () => {
  const q = search.value.toLowerCase();
  items.forEach((item) => {
    item.classList.toggle("hidden", !item.textContent.toLowerCase().includes(q));
  });
});

Prefer a CLASS. A class says WHAT something is and rarely changes.
A tag name says nothing about which of many elements you mean.

Looking an element up every time you need it is slower, and it is a frequent
source of code that appears to work and then stops working for no clear reason.
$q$,null),
('Events and changing the page',1,'Reference: MDN, event handlers','external_link',
null,'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Events_handlers'),
('Events and changing the page',2,'Bubbling, and listeners that pile up','code',
$q$// Click and key events BUBBLE: they travel from the target up through
// its ancestors. Attaching to a container therefore catches events on
// everything inside it -- usually what you want, occasionally the opposite.

document.querySelector(".list").addEventListener("click", handleClick);

// A listener added on every page load without being removed ACCUMULATES.
// After three navigations one click fires three handlers.
// If something happens twice, check this FIRST.

const listener = () => console.log("clicked");
button.addEventListener("click", listener);
// ...later, when the view is torn down:
button.removeEventListener("click", listener);

// TIMING: code that runs before the elements exist finds nothing and fails
// without saying why. Run once the document is ready, or put the script at
// the end of the document.
$q$,null),
('A small interactive page of your own',1,'the-filter.js','code',
$m$// the-filter.js
// A working filter, and the cases most implementations forget to check.

const search = document.querySelector("#search");
const items  = document.querySelectorAll(".item");
const empty  = document.querySelector("#no-results");

function filter() {
  const q = search.value.trim().toLowerCase();
  let shown = 0;

  items.forEach((item) => {
    const hit = item.dataset.name.toLowerCase().includes(q);
    item.classList.toggle("hidden", !hit);
    if (hit) shown++;
  });

  // The case most implementations forget: a search with no matches must SAY SO.
  empty.classList.toggle("hidden", shown !== 0);
}

search.addEventListener("input", filter);
filter();

/* CHECK IT PROPERLY
   [x] empty search shows everything
   [x] a capital letter matches the same item as a lower one
   [ ] a search with no matches shows nothing AND says so
   [ ] a search that matches nothing on purpose leaves the page intact
   [ ] removing the listener stops the filtering

   Small enough to finish in one sitting, large enough to contain a real bug.
*/
$m$,null)
) as v(lesson_title, pos, mat_title, mat_type, mat_content, mat_url)
join public.lessons l on l.title = v.lesson_title
join public.modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
where c.slug in ('computer-networking-essentials', 'security-plus-exam-preparation',
                 'it-support-essentials', 'web-fundamentals')
  and not exists (select 1 from public.lesson_materials lm where lm.lesson_id = l.id and lm.title = v.mat_title);

commit;