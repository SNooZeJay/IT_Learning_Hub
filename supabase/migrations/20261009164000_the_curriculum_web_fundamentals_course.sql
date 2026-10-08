-- Web Fundamentals: modules and lessons.

begin;

insert into public.modules (course_id, title, description, position, status)
select c.id, v.title, v.description, v.position, 'published'::public.content_status
from (values
  ('web-fundamentals','Structure with HTML',
   'What HTML is for, how elements nest, and why semantic markup is not a style preference.',1),
  ('web-fundamentals','Presentation with CSS',
   'Selectors, the cascade, the box model, and layouts that survive a phone screen.',2),
  ('web-fundamentals','Behaviour with JavaScript',
   'The page as an object you can change, events, and a small interactive page of your own.',3)
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
('Structure with HTML','What HTML is for',
 'Markup as structure and meaning, and why the browser needs it before anything else.',
$q$HTML describes what a piece of content is, not how it should look. A heading is a heading, a list is a list, and a navigation region is navigation. That distinction is the whole idea, and it separates cleanly from the other two technologies.

The browser receives HTML first, builds a tree of elements from it, and everything else happens afterwards. Styling changes appearance. Scripting changes behaviour. Neither adds meaning, because meaning was already decided by the markup.

This is why starting with HTML is not the slow way round. A page whose structure is wrong cannot be rescued by styling, because there is nothing correct to style. Everything else is working around a structure that was never built.

Two habits worth forming early. View the page source of sites you use, which is the fastest way to learn how experienced people mark things up. And choose the element that says what the thing is, not the one that looks closest by default.
$q$,15,true,1),
('Structure with HTML','Elements, attributes and nesting',
 'The three things every tag is made of, and why nesting is not just indentation.',
$q$An element is a piece of content with a meaning. An attribute carries extra information about it. Nesting places one element inside another.

Nesting is more than visual indentation. Some elements only make sense inside another, and the browser will not always tell you when you get it wrong; it will render something, quietly, that is not what you meant.

Some elements cannot contain themselves. A link cannot contain a link, which is the classic mistake when someone wraps a whole card in an anchor to make it clickable, and it produces two overlapping links that fight over the click.

A tag that is not closed is the most common error beginners make, and it produces content that ends up in the wrong place further down the page, which is confusing to debug because the symptom is far from the cause.

Use the validator. It catches all of these in seconds, and it catches the ones that render correctly today and will break in a browser you have not tried.
$q$,15,false,2),
('Structure with HTML','Semantic markup and why it matters',
 'Choosing the element that describes the content, and what you get for it.',
$q$Semantic markup means choosing the element for what the content is rather than for how you want it to appear.

It buys three things that no amount of styling can substitute. Assistive technology depends on it: a screen reader navigating by heading level gets a usable outline of a page, and without real headings it gets a wall. Search engines get structure they can interpret. And your own CSS gets simpler, because styling a real list does not require reproducing list behaviour by hand.

The element you reach for most often is the div. It works, and it carries no meaning at all, so a document built from divs describes nothing to anyone but you.

Choosing the right tag is also faster. A navigation element is already a landmark. A form element already has keyboard behaviour. A button is already focusable and already announces itself as a button. You are removing work rather than adding it.

If nothing fits, that is information. It usually means the content needs to be thought about rather than the markup chosen.
$q$,16,false,3),
('Presentation with CSS','Selectors and the cascade',
 'Choosing what to style, and what decides when several rules disagree.',
$q$A selector says which elements a rule applies to. The cascade decides which rule wins when more than one matches the same element.

Cascade resolution goes by origin and importance first, then specificity, then source order. Specificity is worth internalising because it is the reason a rule you wrote is being ignored: something more specific is winning, and no amount of editing your rule will change that.

The habit that avoids most of this pain is to keep specificity flat and let order do the work. A single class selector throughout a stylesheet is easy to reason about. Descendant selectors nested three deep are not, and they break the moment the markup changes slightly.

Classes are for what something is. Identifiers are for a single unique thing, and there is rarely one. Reaching for an identifier to win a specificity fight is the most common reason stylesheets become impossible to maintain.

Learn to inspect which rule is actually winning. The browser will tell you, and it turns a puzzle into a fact.
$q$,16,false,1),
('Presentation with CSS','The box model and layout',
 'Every element is a box, and layout is deciding how those boxes sit relative to each other.',
$q$Every element on the page is a rectangular box. The box model is the set of rules deciding how much room it takes: content, then padding, then border, then margin.

Whether padding and border count toward the size you specify is the detail that catches everyone. With one setting they are added to it, so a width means what you think it means. With another they are included in it, so the same width produces something visibly narrower.

Layout methods answer different questions. Normal flow puts things one after another in document order and is correct far more often than people assume. Flexbox arranges items in one direction, in a line or a column, which is what navigation bars and card rows are. Grid arranges in two dimensions at once, which is what page layouts are.

The order to learn them is normal flow, then Flexbox, then Grid. Reaching for Grid first usually produces a layout that is harder to change later than one built in order.
$q$,17,false,2),
('Presentation with CSS','Responsive design',
 'Layouts that work on a phone, and what changes when the screen is small.',
$q$Responsive design is not one layout that shrinks. It is one layout per size range, chosen deliberately.

The starting problem is that a design built for a wide screen and squeezed into a narrow one usually fails badly, because the elements have nowhere to go. The fix is a different arrangement, not a smaller version.

Two tools do most of the work. Relative units, so sizes are expressed against the container rather than in absolute pixels, which is what lets something scale sensibly. And media queries, which apply different rules below a chosen width.

There is a specific accessibility requirement behind this as well: support text zoom and respect the user font-size preference. A layout that breaks when someone enlarges their browser text is not responsive, it is merely rearranging for small screens.

Test by actually resizing, and test by enlarging text. Reading the layout on a narrow window is not the same as using it on a phone.
$q$,16,false,3),
('Behaviour with JavaScript','The DOM: the page as an object',
 'The browser turns your HTML into a tree you can read and change.',
$q$Parsing HTML produces the DOM, a tree of objects representing the document. Scripting does not manipulate the page directly; it manipulates this tree, and the browser redraws whatever changed.

Because it is an object tree, it can be navigated rather than searched: from any element to its parent, to its children, to the next sibling. That is usually clearer than querying for a selector and hoping it matches what you meant.

Selecting elements happens by identifier, by class, or by tag name. Prefer the class. A class describes what something is and is unlikely to change; a tag name says nothing about which of many elements you mean.

The one rule that matters most: keep a reference to what you need. Look elements up once and hold on to them. Looking an element up every time you need it is slower, and it is a frequent source of code that appears to work and then stops working for no clear reason.
$q$,15,false,1),
('Behaviour with JavaScript','Events and changing the page',
 'Responding to a user, and the timing questions that come with it.',
$q$An event is something the user did that the page reacts to: a click, a keypress, a submission. You attach a function to an event and it runs when that happens.

The page is a stream of elements, so a click may land on a child of the thing you are listening to rather than the thing itself. Listeners for click and key events bubble up from the target through its ancestors, so attaching to a container catches events on everything inside it. That is usually what you want and occasionally the opposite.

Adding and removing listeners is a real decision. A listener added on every page load without being removed accumulates, and a click then fires every handler ever registered. If something happens twice, this is the first thing to check.

Timing is the other half. Code that runs before the elements exist finds nothing and fails without saying why. Either run it once the document is ready, or put it at the end of the document so the elements already exist.
$q$,16,false,2),
('Behaviour with JavaScript','A small interactive page of your own',
 'Building a working page that filters a list, and checking it properly.',
$q$This lesson builds a page that filters a list of items as the user types: an input box, a list, and script that hides the entries that do not match.

It uses the whole module. Selecting the elements and holding references to them. Listening for the input event. Reading the current value and comparing it against each item. Changing a class on the ones that do not match. And a CSS rule that actually hides that class, which keeps the styling decision out of the script.

Then it checks the work properly. Empty search shows everything. A search with no matches shows nothing and says so, which is the case most implementations forget. A search that matches nothing on purpose should not leave the page looking broken. And a capital letter should match the same item as a lower one, which is a real bug in most hand-rolled filters.

This is small enough to finish in one sitting and large enough to contain a genuine bug. That combination is worth more than a larger example that was never finished.
$q$,20,false,3)
) as v(module_title, title, summary, content, minutes, is_preview, position)
join public.modules m on m.title = v.module_title
join public.courses c on c.id = m.course_id
where c.slug = 'web-fundamentals'
  and not exists (select 1 from public.lessons l where l.module_id = m.id and l.title = v.title);

commit;