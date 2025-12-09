import { EventHandle } from 'playcanvas';

import { Events } from './events';

const registerTimelineEvents = (events: Events) => {
    let frames = 180;
    let frameRate = 30;
    let smoothness = 1;

    // frames

    const setFrames = (value: number) => {
        if (value !== frames) {
            frames = value;
            events.fire('timeline.frames', frames);
        }
    };

    const setFrames2 = (value: number) => {
        if (value !== frames) {
            frames = value;
        }
    };

    events.function('timeline.frames', () => {
        return frames;
    });

    events.on('timeline.setFrames', (value: number) => {
        setFrames(value);
    });

    // frame rate

    const setFrameRate = (value: number) => {
        if (value !== frameRate) {
            frameRate = value;
            events.fire('timeline.frameRate', frameRate);
        }
    };

    events.function('timeline.frameRate', () => {
        return frameRate;
    });

    events.on('timeline.setFrameRate', (value: number) => {
        setFrameRate(value);
    });

    // smoothness

    const setSmoothness = (value: number) => {
        if (value !== smoothness) {
            smoothness = value;
            events.fire('timeline.smoothness', smoothness);
        }
    };

    events.function('timeline.smoothness', () => {
        return smoothness;
    });

    events.on('timeline.setSmoothness', (value: number) => {
        setSmoothness(value);
    });

    // current frame
    let frame = 0;

    const setFrame = (value: number) => {
        if (value !== frame) {
            frame = value;
            events.fire('timeline.frame', frame);
        }
    };

    
    let frame_prev = 0 ;
    let prevValidUrlIndex = 0;
    const setFrame2 = (value: number) => {
        if (value !== frame) {
            frame = value
            //  events.fire('timeline.frameInd', frame);
               

             events.fire('timeline.frame2', frame);


            // const [lastLoadedSefgment, validlastUrlIndex] = events.invoke("plysequence.lastvalidurl");
            // console.log("validurlindex",validlastUrlIndex, lastLoadedSefgment, frame,value);
            // if ( frame  > validlastUrlIndex + 2) {
            //     frame_prev = validlastUrlIndex;
                
            //     events.fire('timeline.frameInd', validlastUrlIndex+1);
            //     events.fire('timeline.frame2', validlastUrlIndex+1);

                
            // } else {
            //     events.fire('timeline.frameInd', frame_prev);
               

            //     events.fire('timeline.frame2', frame_prev);

            // }
            // prevValidUrlIndex = validUrlIndex

            // console.log("validurlindex",validUrlIndex, frame);
            // events.fire('timeline.frame2', frame);

        }
    };


    events.function('timeline.frame', () => {
        return frame;
    });

    events.on('timeline.setFrame', (value: number) => {
        setFrame(value);
    });

    events.on('timeline.setFrame2', (value: number) => {
        setFrame2(value);
    });

    // anim controls
    let animHandle: EventHandle = null;

    const play = () => {
        let time = frame;

        // handle application update tick
        animHandle = events.on('update', (dt: number) => {
            time = (time  + dt * frameRate) % frames;
            setFrame(Math.floor(time));
            events.fire('timeline.time', time);
        });
    };

    const play2 = () => {
        let time = frame;
        
        // handle application update tick
        animHandle = events.on('update', (dt: number) => {
            // console.log("frame", dt)
            const [frames2, lastvalidind] = events.invoke("plysequence.lastvalidurl")
            // if (lastvalidind > 0 && lastvalidind % 300 == 0)
            // {
            //     events.fire("RevokeBlobUrls")
            // } 
            if (frames2 >= 180) {
                events.fire('stopSpinner');

                time = (time + dt * frameRate) % frames2;
                setFrame2(Math.floor(time));
                events.fire('timeline.time', time);
            } else {
                events.fire('startSpinner');

            }

        });
    };

    const stop = () => {
        animHandle.off();
        animHandle = null;
    };

    // playing state
    let playing = false;

    const setPlaying = (value: boolean) => {
        if (value !== playing) {
            playing = value;
            events.fire('timeline.playing', playing);
            if (playing) {
                play();
            } else {
                stop();
            }
        }
    };

    const setPlaying2 = (value: boolean) => {
        if (value !== playing) {
            playing = value;
            events.fire('timeline.playing', playing);
            if (playing) {
                play2();
            } else {
                stop();
            }
        }
    };

    events.function('timeline.playing', () => {
        return playing;
    });

    events.on('timeline.setPlaying', (value: boolean) => {
        setPlaying(value);
    });
    events.on('timeline.setPlaying2', (value: boolean) => {
        setPlaying2(value);
    });
    

    // keys

    const keys: number[] = [];

    events.function('timeline.keys', () => {
        return keys;
    });

    events.on('timeline.addKey', (frame: number) => {
        keys.push(frame);
        events.fire('timeline.keyAdded', frame);
    });

    events.on('timeline.removeKey', (index: number) => {
        keys.splice(index, 1);
        events.fire('timeline.keyRemoved', index);
    });

    events.on('timeline.setKey', (index: number, frame: number) => {
        if (frame !== keys[index]) {
            keys[index] = frame;
            events.fire('timeline.keySet', index, frame);
        }
    });

    // doc

    events.function('docSerialize.timeline', () => {
        return {
            frames,
            frameRate,
            frame,
            smoothness
        };
    });

    events.function('docDeserialize.timeline', (data: any = {}) => {
        events.fire('timeline.setFrames', data.frames ?? 180);
        events.fire('timeline.setFrameRate', data.frameRate ?? 30);
        events.fire('timeline.setFrame', data.frame ?? 0);
        events.fire('timeline.setSmoothness', data.smoothness ?? 0);
    });
};

export { registerTimelineEvents };
