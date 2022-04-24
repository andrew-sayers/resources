#!/usr/bin/env node

const child_process = require('child_process');
const fs = require('fs');
const readline = require('readline');

const spawn = require("child_process").spawn,
      ls_files = spawn('git', ['ls-files','entities']);

const output = {
    format: 'https://sleepdiary.github.io/resources/entities#version-1',
};

readline
    .createInterface(ls_files.stdout, ls_files.stdin)
    .on(
        'line',
        filename => filename.replace(
            /\/([^\/]+)\.json$/,
            (_,key) => {
                output[key] = { records: JSON.parse(fs.readFileSync(filename)) }
            }
        )
    )
    .on(
        'close',
        () => {
            const errors = [];
            const valid_values = output.valid_values;

            [ 'specialists', 'software' ].forEach(

                source => output[source].forEach( (p,n) => {

                    const add_error = message => {
                        errors.push( source + ' entry ' + n + ": " + message );
                    };

                    p.name_key = p.name.replace(name_preamble,'').toLowerCase().replace(/^[. ]*/,'');

                    if ( !p.last_updated.getTime ) {
                        add_error("last updated");
                    }
                    entry.last_updated = {
                        value: [
                            zero_pad(p.last_updated.getFullYear()),
                            zero_pad(p.last_updated.getMonth()+1),
                            zero_pad(p.last_updated.getDate()),
                        ].join('-'),
                    };

                    if ( source == 'specialists' ) {

                        if ( !valid_values.specialist_type[p.specialist_type] ) add_error("specialist type");

                        if ( p.hasOwnProperty('referral_type') ) {
                            if ( !Array.isArray(p.referral_type) ) {
                                p.referral_type = [p.referral_type];
                            }
                            p.locations.forEach(
                                l => l.referral_type = l.referral_type || p.referral_type
                            );
                        } else {
                            const known_referral_types = {}
                            const referral_types = p.referral_type = [];
                            p.locations.forEach(
                                l => {
                                    if ( !l.referral_type ) {
                                        add_error(`missing referral_type for ${l}`);
                                    }
                                    if ( !Array.isArray(l.referral_type) ) {
                                        l.referral_type = [l.referral_type];
                                    }
                                    l.referral_type.forEach(
                                        t => {
                                            if ( !known_referral_types[t] ) {
                                                known_referral_types[t] = 1;
                                                referral_types.push(t);
                                            }
                                        }
                                    );
                                }
                            );
                        }
                        p.referral_type.forEach(
                            type => {
                                if ( !valid_values.referral_type[type] ) add_error("referral type");
                            }
                        );

                        if ( !valid_values.procedure_type[p.procedure_type] ) add_error("procedure type");

                        p.locations.forEach( location => {
                            location.address = location.address.replace(/\s*$/,'');
                            location.map_url = `https://maps.google.com/maps/@${location.gps_coordinates.replace(/\s/g,'')},19z`;
                            location.gps_coordinates = location.gps_coordinates.split(/\s*,\s*/);
                        });

                    }

                    const has_multiple_galleries = (p.forms||[]).length + (p.reports||[]).length > 1;
                    ['forms','reports'].forEach( fr_key =>
                        (p[fr_key]||[]).forEach( fr => {

                            if ( fr.name ) {
                                fr.display_name = p.name + ': ' + fr.name;
                                fr.short_name   = fr.name;
                            } else {
                                fr.display_name = fr.short_name = p.name;
                                if ( p[fr_key].length > 1 ) {
                                    add_error(`Please provide names for all ${fr} in ${p.name}`);
                                }
                            }
                            fr.display_name = fr.display_name.replace( /^the +/i, '' );
                            fr.short_name   = fr.short_name  .replace( /^the +/i, '' );

                            if ( fr.start_page ) {
                                fr.display_name += ",\npage "+fr.start_page;
                                fr.short_name   += ",\npage "+fr.start_page;
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
                                if ( !fr.url   ) fr.url   = image.url  ;
                                if ( !fr.thumb ) fr.thumb = image.thumb;
                                if ( !image.title ) image.title = fr.name || p.name;
                                image.display_name = ( has_multiple_galleries ? fr.name + ': ' : '' ) + image.title;
                                image.short_name = image.title;
                                image.short_name = image.short_name.replace( /^the +/i, '' );
                                thumbs[image.thumb] = [ 150, image.url ];
                            });
                            Object.keys(thumbs).forEach(
                                orig_thumb => orig_thumb.replace(
                                    /^\/resources\/(thumbs\/.*)/,
                                    async (_,thumb) => {
                                        thumb = __filename.replace(/[^\/]*$/,thumb);
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
                                                    (_,source) => create_thumb(fs.readFileSync(
                                                        __filename.replace(/[^\/]*$/,source)
                                                    ))
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

                    if ( errors.length ) {
                        throw Error(`Invalid keys(s): ${JSON.stringify(errors)}\nObject: ${JSON.stringify(p)}`);
                    }

                    return p;

                })

                // Sort:
                    .sort( (a,b) =>
                        a.name_key.localeCompare(b.name_key, {ignorePunctuation: true})
                    )

            );

            console.log(JSON.stringify(output));
        }
    );
