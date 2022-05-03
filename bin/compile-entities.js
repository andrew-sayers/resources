#!/usr/bin/env node

const child_process = require('child_process');
const fs = require('fs');
const readline = require('readline');
const http  = require('http');
const https = require('https');
const url   = require('url');

const base_dir = __filename.replace(/[^\/]+\/[^\/]*$/,'');

const output = {
    format      : 'https://sleepdiary.github.io/resources/entities#version-002',
    specialist  : { records: [] },
    software    : { records: [] },
    valid_values: JSON.parse(fs.readFileSync("entities/valid_values.json"))
};

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

const ls_files = child_process.spawn('git', ['ls-files','entities']);
readline
    .createInterface(ls_files.stdout, ls_files.stdin)
    .on(
        'line',
        filename => filename.replace(
            /\/([^\/]+)\/.*\.json$/,
            (_,key) => {
                try {
                    output[key].records.push(JSON.parse(fs.readFileSync(filename)))
                } catch ( e ) {
                    throw Error( filename + ": " + e );
                }
            }
        )
    )
    .on(
        'close',
        () => {
            const errors = [];
            const valid_values = output.valid_values;

            [ 'specialist', 'software' ].forEach(

                source => output[source].records.forEach( (p,n) => {

                    const add_error = message => {
                        errors.push( source + ' entry ' + n + ": " + message );
                    };

                    const name = p.name;

                    p.name = {
                        key: name.replace(name_preamble,'').toLowerCase().replace(/^[. ]*/,''),
                        value: name
                    };

                    if ( source == 'specialist' ) {

                        if ( !valid_values.specialist_type[p.specialist_type] ) add_error("specialist type");

                        if ( p.hasOwnProperty('referral_types') ) {
                            if ( !Array.isArray(p.referral_types) ) {
                                p.referral_types = [p.referral_types];
                            }
                            p.locations.forEach(
                                l => l.referral_types = l.referral_types || p.referral_types
                            );
                        } else {
                            const known_referral_typess = {}
                            const referral_typess = p.referral_types = [];
                            p.locations.forEach(
                                l => {
                                    if ( !l.referral_types ) {
                                        add_error(`missing referral_types for ${l}`);
                                    }
                                    if ( !Array.isArray(l.referral_types) ) {
                                        l.referral_types = [l.referral_types];
                                    }
                                    l.referral_types.forEach(
                                        t => {
                                            if ( !known_referral_typess[t] ) {
                                                known_referral_typess[t] = 1;
                                                referral_typess.push(t);
                                            }
                                        }
                                    );
                                }
                            );
                        }
                        p.referral_types.forEach(
                            type => {
                                if ( !valid_values.referral_types[type] ) add_error("referral type");
                            }
                        );

                        if ( !valid_values.procedure_type[p.procedure_type] ) add_error("procedure type");

                        p.locations.forEach( location => {
                            location.address = location.address.replace(/\s*$/,'');
                            if ( location.name ) {
                                location.display_name = name + ': ' + location.name;
                                location.short_name   = location.name;
                            } else {
                                location.display_name = location.short_name = name;
                            }
                            location.display_name = location.display_name.replace( /^the +/i, '' );
                            location.short_name   = location.short_name  .replace( /^the +/i, '' );
                            location.has_name     = !!location.name;
                        });

                    }

                    const has_multiple_galleries = (p.forms||[]).length + (p.reports||[]).length > 1;
                    ['forms','reports'].forEach( fr_key =>
                        (p[fr_key]||[]).forEach( fr => {

                            fr.doc_type = fr_key.replace(/s$/,'');

                            if ( fr.name ) {
                                fr.display_name = name + ': ' + fr.name;
                                fr.short_name   = fr.name;
                            } else {
                                fr.display_name = fr.short_name = name;
                                if ( p[fr_key].length > 1 ) {
                                    add_error(`Please provide names for all ${fr} in ${name}`);
                                }
                            }
                            fr.display_name = fr.display_name.replace( /^the +/i, '' );
                            fr.short_name   = fr.short_name  .replace( /^the +/i, '' );
                            fr.has_name     = !!fr.name;
                            delete fr.name;

                            if ( fr.start_page && fr.start_page != 1 ) {
                                fr.display_name += ",\npage "+fr.start_page;
                            } else {
                                fr.start_page = 1;
                            }

                            if ( fr.layout == "calendar" ) {
                                fr.page_duration = {
                                    key  : to_duration(fr.page_duration),
                                    value: fr.page_duration,
                                };
                                fr.start_time = {
                                    key  : to_time(fr.start_time),
                                    value: fr.start_time
                                };
                            }

                            let thumbs = {};
                            if ( fr.thumb ) thumbs[fr.thumb] = [ 150, fr.url ];
                            fr.gallery.forEach( image => {
                                if ( fr.start_page != 1 && image.url.search(/#/) == -1 ) {
                                    image.url += `#page=${fr.start_page}`
                                }
                                thumbs[image.thumb] = [ 150, image.url ];
                                image.url = image.url.replace( / /g, '%20' );
                                if ( !fr.url   ) fr.url   = image.url  ;
                                if ( !fr.thumb ) fr.thumb = image.thumb;

                                if ( image.name ) {
                                    image.display_name = ( has_multiple_galleries ? fr.short_name + ': ' : '' ) + image.name;
                                    image.short_name   = image.name;
                                } else {
                                    image.display_name = fr.display_name;
                                    image.short_name   = fr.short_name;
                                }
                                image.short_name = image.short_name.replace( /^the +/i, '' );
                                image.has_name     = !!image.name;
                                delete image.name;
                            });
                            Object.keys(thumbs).forEach(
                                orig_thumb => orig_thumb.replace(
                                    /^\/resources\/(thumbs\/.*)/,
                                    async (_,thumb) => {
                                        thumb = base_dir + thumb;
                                        if ( !fs.existsSync(thumb) ) {
                                            const thumb_dir = thumb.replace(/\/[^/]*$/,'');
                                            if ( !fs.existsSync(thumb_dir) ) fs.mkdirSync(thumb_dir);
                                            const width = thumbs[orig_thumb][0];
                                            const url = thumbs[orig_thumb][1];
                                            console.log(`Creating thumb: ${url} -> ${thumb}`);
                                            const create_thumb =
                                                  pdf => {
                                                      let format;
                                                      thumb.replace(/\.([a-z0-9]+)$/, (_,f) => format = f);
                                                      const writer = child_process.spawn(
                                                          '/bin/sh',[
                                                              '-c',
                                                              `pdftoppm -f ${fr.start_page} -l ${fr.start_page} - | convert -resize ${width} - ${format}:-`,
                                                          ]
                                                      );
                                                      writer.stderr.on('data', data => console.error(`${data}`));
                                                      writer.stdin.write(pdf);
                                                      writer.stdin.end();
                                                      let jpg = [];
                                                      writer.stdout.on('data', data => jpg.push(data));
                                                      writer.on(
                                                          'close',
                                                          () => fs.writeFileSync( thumb, Buffer.concat(jpg) )
                                                      );
                                                  };
                                            if ( !url.search(/^\/resources\//) ) { // local file
                                                url.replace(
                                                    /^\/resources\/(.*)/,
                                                    (_,source) => create_thumb(fs.readFileSync(base_dir+source))
                                                );
                                            } else {
                                                ( url.search(/^https:/) ? http : https )
                                                    .get(
                                                        url,
                                                        res => {
                                                            let pdf = [];
                                                            res
                                                                .on( 'data', chunk => pdf.push(chunk) )
                                                                .on( 'end' , () => create_thumb(Buffer.concat(pdf)) )
                                                        }
                                                    );
                                            }
                                        }
                                    })
                            );

                        })
                    );

                    // remove optional values:
                    [
                        'registration_tel',
                        'registration_fax',
                        'registration_url',
                        'registration_other',
                        'booking_tel',
                        'booking_fax',
                        'booking_url',
                        'booking_other',
                        'outcome_other',
                    ]
                        .filter ( key => !p[key] )
                        .forEach( key => delete p[key] )
                    ;
                    (p.locations||[]).forEach( location =>
                        [
                            `name`,
                            `gps`,
                            `tel`,
                            `fax`,
                            `url`,
                        ]
                            .filter ( key => !location[key] )
                            .forEach( key => delete location[key] )
                    );

                    if ( errors.length ) {
                        throw Error(`Invalid keys(s): ${JSON.stringify(errors)}\nObject: ${JSON.stringify(p)}`);
                    }

                    return p;

                })

            );

                // Sort:
            [ 'specialist', 'software' ].forEach(
                source => output[source].records
                    .sort( (a,b) =>
                        a.name.key.localeCompare(b.name.key, {ignorePunctuation: true})
                    )
            );

            fs.writeFileSync('entities.json',JSON.stringify(output));
        }
    );
