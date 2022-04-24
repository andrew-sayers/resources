#!/usr/bin/env node

/*

TODO:
* convert existing procedures to new style

*/

const fs = require('fs');

const title = 'New specialist: The Center for Sleep Medicine';
const issue = fs.readFileSync("please-delete-me/new-issue.txt").toString();
const child_process = require('child_process');

function zero_pad(n,len) {
    n = n.toString();
    while ( n.length < (len||2) ) n = '0'+n;
    return n;
}

const multipliers = {
    day: 1,
    week: 7,
    month: 30,
};
function to_duration(d) {
    let ret=0;
    if ( d == "variable" ) return 0;
    d.replace(
        /^([0-9]+) (day|week|month)s?$/i,
        (_,base,multiplier) => ret = parseInt(base,10) * multipliers[multiplier.toLowerCase()]
    );
    if ( !ret ) {
        throw Error(`Could not convert '${d}' to duration`);
    }
    return zero_pad(ret,4);
}

function to_time(t) {
    switch ( t.toLowerCase() ) {
    case 'midnight': return "00";
    case 'noon'    : return "12";
    default:
        let ret;
        t.replace(
            /^([0-9]+) *([ap])m$/i,
            (_,n,ap) => ret = parseInt(n,10) + (ap=='a'?0:12)
        );
        if ( !ret ) {
            throw Error(`Could not convert ${t} to time`);
        }
        return zero_pad(ret,2);
    }
}

const name_preamble = /^(?:mr|mrs|miss|ms|dr|the)\b/i;

title.replace(
    /^New (specialist|software):/,
    (_,entity_type) => issue.replace(/```(.*)```/s, (_,text) => {
        const entry = JSON.parse(text);
        const filename = `entities/${entity_type}.json`;
        const entries = JSON.parse(fs.readFileSync(filename));

        let message = `Hi!

We've automatically generated [a first draft](https://github.com/sleepdiary/resources/commit/$COMMIT_ID) based on your comments.

If you know how to [fork a repository](https://docs.github.com/en/get-started/quickstart/fork-a-repo), you're welcome to edit the file yourself.  Just let us know the repository to look at.

The following jobs need to be done:

`
        entry.last_updated = new Date().toISOString().split("T")[0];

        [ 'forms', 'reports' ].forEach(
            fr => entry[fr].forEach( (doc,n) => {
                if ( doc.url ) {
                    const url = doc.url;
                    delete doc.url;
                    doc.gallery = [
                        {
                            thumb: `/resources/thumbs/${doc.name||entry.name}.jpg`,
                            url: doc.url,
                        }
                    ];
                } else {
                    doc.gallery = "\uE000";
                    message += `[ ] Create a gallery for ${fr}[${n}]\n`;
                }
                doc["\uE001"] = "(line used for internal processing)";
                message += `[ ] Fill in extra information for ${fr}[${n}]\n`;
            })
        );

        message += `[ ] Remove TODO items
[ ] Any last checks/process improvements
[ ] Merge branch into main`

        entries.push("\uE003");
        entries.push(entry);

        const new_entry_text = (
            JSON
                .stringify(entries,null,'  ')
                .replace(
                    /"\uE000"/g,
                    `[
#          TODO: fill in the values below:
#          {
#            "url": "...",
#            "thumb": "..."
#          },
        ]`
                )
                .replace(
                    /.*\uE001.*/g,
                    `#        TODO: fill in the values below:
#        layout: calendar
#        page duration: # e.g. 14 days or 2 weeks
#        total pages: # e.g. 1 or variable
#        start time: # e.g. Noon or 6pm
#        in-bed marker: # e.g. "&darr;" or (none)
#        out-of-bed marker: # e.g. "&uarr;" or (none)
#        sleep marker: # e.g. ▬ or ▮
#        events:
#          -
#            key: # e.g. C
#            value: # e.g. coffee, cola, or tea
#          ...
#`
                )
                .replace(
                    /.*\uE003.*/g,
                    "# TODO: check and push this new entry:"
                )
                .replace( /\n*$/, "\n" )
        );

        fs.writeFileSync(filename,new_entry_text);

        const spawn = require("child_process").spawnSync;

        spawn('git', ['commit',filename,'-m','First draft for issue #(TODO: issue number)']);

        spawn('git', ['push','origin','HEAD:#(TODO: issue number)']);

        console.log(new_entry_text);

    })
);
