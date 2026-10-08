-- The networking and cybersecurity courses: modules and lessons.
--
-- Same shape as the programming curriculum: three modules of three article lessons,
-- keyed on (module title, lesson title) and inserted only when absent.
--
-- Quotas and formats here reference stable, published sources - RFC 791 for IP, the
-- IANA service-name registry for ports, CompTIA's own certification page - rather than
-- invented links.

begin;

insert into public.modules (course_id, title, description, position, status)
select c.id, v.title, v.description, v.position, 'published'::public.content_status
from (values
  ('computer-networking-essentials','How data travels',
   'What a packet is, why systems are built in layers, and what happens on the last hop.',1),
  ('computer-networking-essentials','Addressing and naming',
   'How devices are identified on a network, how networks are divided up, and how one address serves many services.',2),
  ('computer-networking-essentials','DNS, routing and troubleshooting',
   'Turning names into addresses, how traffic finds its way, and a method for finding where it breaks.',3),
  ('security-plus-exam-preparation','General security concepts',
   'The vocabulary the exam is built on: the triad, risk language, and the principles behind access control.',1),
  ('security-plus-exam-preparation','Threats and vulnerabilities',
   'What actually goes wrong, from malicious code and social engineering through to attacks on the network itself.',2),
  ('security-plus-exam-preparation','Security operations and the exam',
   'Hardening and monitoring, incident response in the right order, and how the exam itself is put together.',3)
) as v(course_slug, title, description, position)
join public.courses c on c.slug = v.course_slug
where not exists (select 1 from public.modules m where m.course_id = c.id and m.title = v.title);

insert into public.lessons
  (module_id, title, summary, content, lesson_type, position, duration_minutes,
   is_required, is_preview, status)
select m.id, v.title, v.summary, v.content,
       'article'::public.lesson_type, v.position, v.minutes,
       true, v.is_preview, 'published'::public.content_status
from (values
('How data travels','Packets, addresses and the postal analogy',
 'Why the network chops your data up, and what each piece carries.',
$q$When you send something over a network, the network does not send it as one piece. It splits it into packets, sends each one independently, and reassembles them at the other end.

The postal analogy is useful right up to the point where it misleads. Each packet is a letter: it carries the destination address, the return address, and the content. Each is numbered, because they may arrive out of order. Each is independent, because a router forwards one packet without waiting to know anything about the next.

The part the analogy hides is the reason for splitting at all. Independent packets can each take the best available route. If one path is congested, the remaining packets route around it, and only that one is delayed. A single unsplittable transfer would have to wait for the slowest path available.

It also explains why a connection can be partly working. Some packets arrive and some do not, and the application at the far end sees something incomplete rather than nothing.
$q$,15,true,1),
('How data travels','The layered model, and why layers exist',
 'The TCP/IP stack, what each layer is responsible for, and what layering buys you.',
$q$Networking systems are split into layers, and each layer is responsible for one job and nothing else. The practical layers are the network interface, the internet, and the transport.

The interface layer moves bits between devices on the same local network. The internet layer routes packets between networks and is where the IP address lives. The transport layer turns unreliable delivery into an ordered stream of bytes, which is what the application actually wants.

The reason for splitting is replacement. Each layer can be replaced without rewriting the layers above it, because each one only ever talks to its neighbours through a defined interface. The internet layer does not know whether the bytes above it come from a browser or a mail client, and it does not need to.

It also makes faults local. When something works but slowly, the layers above the transport layer are innocent by construction, and you can stop looking there.
$q$,16,false,2),
('How data travels','Ethernet, Wi-Fi and the last hop',
 'The link between your device and the rest of the network, and its two common forms.',
$q$Before a packet can cross a network at all, it has to cross one link: the one between your device and the first piece of equipment it meets.

Ethernet is a wired standard. Every device on the segment has an address burned into the interface, called a MAC address, and frames are delivered to that address rather than to the IP address the operating system is using.

Wi-Fi is a radio standard, and it differs in a way that matters for support work: the network is shared. Everyone on it competes for the same radio time, which is why a wireless network gets slower as more devices join, and why signal strength and distance matter more than any wired equivalent.

Modern wireless equipment usually runs the wired standard over the radio link, so you get both: radio delivery underneath, Ethernet addressing on top. Knowing that the two coexist is what makes the behaviour predictable when something is half working.
$q$,15,false,3),
('Addressing and naming','IP addresses and what they identify',
 'What an address actually points at, and the difference between v4 and v6.',
$q$An IP address identifies an interface on a network, not a device. A laptop with a wireless card and an Ethernet port has two, and each has its own address.

Addresses are grouped into networks and hosts. The network part says which network you are on, and the host part says which interface on it. The split point is not arbitrary: it is encoded in a prefix length, written after the address in a form like /24.

IPv4 has been exhausted, which is why IPv6 exists. IPv6 has an effectively unlimited address space, written as eight groups of hexadecimal digits. The practical consequences of the transition are slow and mostly invisible to end users, but you will meet them in logs and configuration files.

The single most useful habit: when you write down an address, write the prefix with it. An address without its prefix is half an address, and half an address is what produces the subnetting mistakes in the next lesson.
$q$,16,false,1),
('Addressing and naming','Subnetting without fear',
 'Splitting a network into smaller ones, and doing the arithmetic once.',
$q$Subnetting is dividing one network into several, so that traffic which does not need to leave does not leave.

The arithmetic is not as bad as its reputation. You are really doing one operation: take the number of host bits available, and split it into a network part and a host part. A /24 gives eight host bits, so 254 usable hosts. Splitting that into two /25s gives 126 each. That is the whole idea.

The mistakes come from doing it under pressure, and the fix is to stop. Decide how many subnets you need, decide how many hosts each must hold, and only then choose the prefix. Writing the binary first makes it reliable and is not slower than guessing twice.

One rule that removes most real-world mistakes: the subnet, the default gateway and the DNS server all belong to the same subnet as the interface they are configured on. A gateway you cannot reach directly is the single most common network fault there is, and this one rule explains most of them.
$q$,18,false,2),
('Addressing and naming','Ports: many services, one address',
 'How one address serves many services at once.',
$q$An IP address gets a packet to a machine. It says nothing about which of the programs on that machine the packet is for.

That is the port number: a 16-bit value that identifies which service. HTTP is 80, HTTPS is 443, SSH is 22, DNS is 53. One address, many ports, many services, all at once.

The pairing is often written as address and port together, and that pairing is what a firewall rule matches on. A rule that permits traffic to an address is permitting it to every port on that address, which is almost never what was intended.

Well-known ports below 1024 need elevated privileges to bind on the system. Anything above that can be used by an ordinary program, which is why choosing an unusual port changes nothing about who can reach a service. It obscures it; it does not protect it.
$q$,15,false,3),
('DNS, routing and troubleshooting','DNS: turning names into addresses',
 'The lookup that turns a name into an address, and why it fails on its own.',
$q$You type a name. The machine needs an address. DNS is the system that does the translation, and it is the step most likely to be quietly wrong.

A resolver receives the query, and either answers from its cache or asks a root server, which points at a top-level domain server, which points at the authoritative server for that name. The result is cached for a stated lifetime, which is why a change to a record can take a while to appear everywhere.

Two failure modes matter more than the others. A name that does not resolve at all, which is obvious and gets reported. And a name that resolves to the wrong address, which is far worse and far harder to spot, because everything appears to work while going somewhere it should not.

DNS is also where a lot of the traffic you can block actually is. Blocking by name stops resolution; blocking the resolved address stops the connection but leaves the lookup succeeding.
$q$,16,false,1),
('DNS, routing and troubleshooting','Routers and default gateways',
 'How traffic finds its way off the local network and around the internet.',
$q$A router connects networks and forwards packets between them. Its decision is simple and worth understanding precisely, because troubleshooting depends on it.

For each packet, the router asks one question: is the destination inside a network I am directly attached to? If yes, send it out that interface. If no, send it to the next hop recorded in its routing table. And if no route matches at all, drop it and tell the sender.

The default route is what that last entry is: a catch-all that says send it here if nothing more specific matches. On your own machine, the default gateway is the address of the router your device sends everything unknown to.

The consequence for diagnosis: a device that can reach its gateway and its DNS but nothing beyond is failing at routing or at whatever sits beyond it. Knowing that the first hop works is what stops you from restarting the machine.
$q$,15,false,2),
('DNS, routing and troubleshooting','A method for finding where a connection breaks',
 'A repeatable order of operations for a connection that will not work.',
$q$Do not guess. Guessing changes one thing at a time across the whole system and tells you nothing about which change mattered.

Work outward in layers, testing one thing at a time and confirming each before moving on. Is the interface up and does it have an address? Can the device reach its own gateway? Does the name resolve, and to what address? Can it reach that address? Is the port open? Does the service answer?

Each step rules out a layer, and the first one that fails is the fault. Working in any other order means retesting things you have already proven.

Two rules that keep the result honest. Change one thing, then retest, so you know what the change did. And write down what you observed, because the next person to ask will not have been watching.
$q$,20,false,3),
('General security concepts','The CIA triad and how it is actually used',
 'Confidentiality, integrity and availability, and how each one fails differently.',
$q$The triad is three properties a security control aims to protect. Confidentiality: only the right people can read it. Integrity: nobody can change it undetected. Availability: the people who need it can reach it.

The useful part is not memorising the words, it is noticing that the three fail differently and want different controls.

Confidentiality is broken by disclosure, so controls are about identity and access: encryption, authentication, permissions. Integrity is broken by undetected change, so controls are about detection rather than prevention: hashing, digital signatures, audit logs, version control. Availability is broken by taking it away, so controls are about redundancy and capacity rather than about secrecy.

Most real incidents are availability incidents. Nobody has to break into anything to make a system unavailable; filling a disk or exhausting a connection pool is enough. A security programme that only thinks about confidentiality will be surprised.
$q$,17,true,1),
('General security concepts','Risk, threats, vulnerabilities and controls',
 'The four words the exam is built on, and how they relate.',
$q$A vulnerability is a weakness. A threat is anything that might exploit it. A risk is the likelihood of that happening multiplied by the damage if it does. A control is what you put in to reduce it.

Keeping these four apart is most of what makes the rest of the material make sense. Patching addresses a vulnerability. Awareness training addresses a threat: the person who will try to trick somebody. A firewall addresses neither directly; it reduces exposure, which lowers likelihood.

Risk is the only one of the four that is a judgement, and the one that decides where effort goes. Two systems can have the same vulnerability and completely different risk, because one of them is reachable from the internet and holds something valuable, and the other is neither.

The practical conclusion is that you cannot reduce every risk. You rank them, spend against the ranking, and accept some deliberately rather than by accident.
$q$,16,false,2),
('General security concepts','Zero trust and least privilege',
 'Never trust by default, and give nobody more than they need.',
$q$Least privilege says a person or process gets only the access their job requires, and no more. Access that is not required is not harmless; it is a standing invitation.

Zero trust is the stronger form of the same idea applied to the architecture itself. It does not mean trusting nobody. It means never trusting by position on the network, and verifying every request regardless of where it came from.

That is a reversal of the older model, where being inside the perimeter was the assumption and everything outside was suspect. Perimeters leak. Once a device inside is compromised, the old model treats everything it touches as trusted. Verifying every request removes that single point of failure.

In practice the two ideas together are what make least privilege achievable. You cannot hand out narrow permissions safely unless you are checking who is asking on every request.
$q$,16,false,3),
('Threats and vulnerabilities','Malware: what each kind does',
 'The categories the exam expects you to tell apart, and what each one does.',
$q$Virus. Worm. Trojan. Ransomware. Spyware. Rootkit. The names overlap more than they should, and the exam expects you to separate them by behaviour rather than by marketing.

A virus attaches to a file and needs something to carry it. A worm copies itself across a network on its own, which is the distinction that matters most and the one most often blurred. A trojan looks like what you wanted and does something else. Ransomware encrypts and then demands payment, usually with a threat of destruction attached. Spyware watches and reports. A rootkit hides its own presence from the tools that would reveal it.

Two things are true across all of them and are worth stating plainly. Modern malware is overwhelmingly delivered as ordinary software that somebody chose to install, and it is overwhelmingly ransomware, because it monetises directly.

Defence therefore leans less on blocking the file and more on limiting what it can reach, what it can change, and how fast you would notice.
$q$,17,false,1),
('Threats and vulnerabilities','Social engineering and the human layer',
 'Why the most effective attacks bypass the technology entirely.',
$q$Social engineering targets the person rather than the machine. No firewall, encryption or password policy fixes it, because the attacker is not breaking in; they are being let in.

The common forms are phishing and its variants, pretexting, and tailgating. Phishing is mass and untargeted. Spear phishing is targeted at one person with details that make it convincing. Pretexting invents a plausible reason to ask for something. Tailgating follows someone through a controlled door.

What makes it work is that it exploits helpfulness and urgency, both of which are good traits. A request that is urgent and slightly unusual makes people act before they check, and that is precisely the window.

The defences are unglamorous and effective. A second channel for verification, so an urgent request from one source can be confirmed through another. A delay before acting on anything that asks for credentials or money. And a culture where checking is treated as careful rather than as unhelpful.
$q$,16,false,2),
('Threats and vulnerabilities','Network attacks you must recognise',
 'The attacks that appear on the exam, and what each one looks like.',
$q$On-path attacks sit between you and the destination and see or alter traffic as it passes: sniffing, which reads; and man-in-the-middle, which alters it.

Denial of service floods a target with traffic so it cannot serve anyone. Distributed denial of service does it from many sources at once. The amplification variant uses servers that reply to spoofed requests, so the target receives far more than was ever sent.

Replay captures legitimate traffic and sends it again later, which is why freshness matters in authentication. Password attacks come in a predictable order: guess a common password, reuse a password stolen elsewhere, spray a few common passwords across many accounts, or brute force one account exhaustively.

SYN flood exploits the fact that a server allocates state when a connection is half-open. It is the clearest example of the general lesson: a small asymmetry between what a sender costs and what a receiver costs is where most denial of service comes from.
$q$,18,false,3),
('Security operations and the exam','Hardening, logging and monitoring',
 'Reducing the surface, then knowing early when something is wrong.',
$q$Hardening is removing everything that is not needed so there is less to attack. Unused services are closed. Default credentials are changed. Access is limited. Patch levels are kept current. Each step removes opportunity rather than adding a defence.

Hardening alone is never enough, because people and software both get things wrong after you finish it. That is what detection is for.

Logging and monitoring answer a different question from prevention: not how to stop it, but how quickly you find out. Centralised logs, because an attacker who reaches a machine can edit its local logs. Alerting on the things that indicate real trouble, such as authentication failures and privilege changes, rather than on everything.

Time is the real measure. The difference between an incident contained in minutes and one contained in weeks is almost entirely how quickly somebody noticed.
$q$,17,false,1),
('Security operations and the exam','Incident response in order',
 'Preparation, detection, containment, eradication, recovery, and why the order matters.',
$q$Incident response is a process with a fixed order, and the order is the part that is worth learning.

Preparation happens before anything occurs: a plan, contacts who are actually reachable, tested backups, and the tools to work with. Detection and analysis establish what happened and how far it went.

Containment stops it spreading while you still need the affected systems. It trades some availability for less damage, and it is a decision made under pressure with incomplete information.

Eradication removes the cause, the malware, the compromised accounts and the entry route. Skipping this and going straight to recovery is how an incident returns, sometimes weeks later.

Recovery restores service from known-good backups, then watches carefully for recurrence. And lessons learned feeds back into preparation, which is the only step that makes the next incident smaller.

The most common real-world failure is skipping eradication, and it is always made for understandable reasons under time pressure.
$q$,18,false,2),
('Security operations and the exam','The exam: domains, question types and tactics',
 'How the exam is put together, and how to read what it is asking.',
$q$Security+ covers general security concepts, threats and vulnerabilities, security operations, and program management and oversight. Most questions sit in the first three, and the weighting is roughly proportional to that.

Question types behave differently and are worth recognising. Performance-based questions put you in a scenario and ask what you do next, which is a judgement about sequence rather than about definition. Multiple-choice questions usually have one clearly best answer, with distractors that are wrong rather than merely less good. And select-from-list questions are easier than they look because two answers are always wrong.

The tactic that helps most is reading the question stem twice, and paying attention to what it is asking for. Many answers are true statements that do not answer the question. When two options look right, the differentiator is usually in the second sentence of the stem.

Answer the ones you are sure about first. The pass mark is well below perfect, and the questions you are confident about are worth more than the one you are agonising over.
$q$,16,false,3)
) as v(module_title, title, summary, content, minutes, is_preview, position)
join public.modules m on m.title = v.module_title
join public.courses c on c.id = m.course_id
where c.slug in ('computer-networking-essentials', 'security-plus-exam-preparation')
  and not exists (select 1 from public.lessons l where l.module_id = m.id and l.title = v.title);

commit;