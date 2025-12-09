import { Vec3 } from 'playcanvas';
import { Events } from './events';
import { Splat } from './splat';

const registerPlySequenceEvents = (events: Events) => {
    let sequenceFiles: File[] = [];
    let sequenceResponses: Response[] = [];
    let sequenceUrls: string[] = [];
    let lastValidUrlInd = 0;

    let sequenceSplat: Splat = null;
    let sequenceFrame = -1;
    let sequenceLoading = false;
    let nextFrame = -1;

    const setFrames = (files: File[]) => {
        // eslint-disable-next-line regexp/no-super-linear-backtracking
        const regex = /(.*?)(\d+)(?:\.compressed)?\.ply$/;

        // sort frames by trailing number, if it exists
        const sorter = (a: File, b: File) => {
            const avalue = a.name?.toLowerCase().match(regex)?.[2];
            const bvalue = b.name?.toLowerCase().match(regex)?.[2];
            return (avalue && bvalue) ? parseInt(avalue, 10) - parseInt(bvalue, 10) : 0;
        };

        sequenceFiles = files.slice();
        sequenceFiles.sort(sorter);
        events.fire('timeline.frames', sequenceFiles.length);
    };

    const setFrames2 = (urls: string[]) => {
        // eslint-disable-next-line regexp/no-super-linear-backtracking
        // const regex = /(.*?)(\d+)(?:\.compressed)?\.ply$/;

        // sort frames by trailing number, if it exists
        // const sorter = (a: File, b: File) => {
        //     const avalue = a.name?.toLowerCase().match(regex)?.[2];
        //     const bvalue = b.name?.toLowerCase().match(regex)?.[2];
        //     return (avalue && bvalue) ? parseInt(avalue, 10) - parseInt(bvalue, 10) : 0;
        // };

        sequenceUrls = urls.slice();
        // sequenceFiles.sort(sorter);
        events.fire('timeline.frames', sequenceUrls.length);
    };


    // resolves on first render frame
    const firstRender = (splat: Splat) => {
        return new Promise<void>((resolve) => {
            splat.entity.gsplat.instance.sorter.on('updated', (count) => {
                resolve();
            });
        });
    };

    const setFrame = async (frame: number) => {
        if (frame < 0 || frame >= sequenceFiles.length) {
            return;
        }

        if (sequenceLoading) {
            nextFrame = frame;
            return;
        }

        if (frame === sequenceFrame) {
            return;
        }

        // if user changed the scene, confirm
        if (events.invoke('scene.dirty')) {
            const result = await events.invoke('showPopup', {
                type: 'yesno',
                header: 'RESET SCENE',
                message: 'You have unsaved changes. Are you sure you want to reset the scene?'
            });

            if (result.action !== 'yes') {
                return;
            }

            events.fire('scene.clear');
            sequenceSplat = null;
        }

        sequenceLoading = true;

        const file = sequenceFiles[frame];
        const newSplat = await events.invoke('import', [{
            filename: file.name,
            contents: file
        }], true) as Splat[];

        // wait for first frame render
        await firstRender(newSplat[0]);

        // destroy the previous frame
        if (sequenceSplat) {
            sequenceSplat.destroy();
        }
        sequenceFrame = frame;
        sequenceSplat = newSplat[0];
        sequenceLoading = false;

        // initiate the next frame load
        if (nextFrame !== -1) {
            const frame = nextFrame;
            nextFrame = -1;
            setFrame(frame);
        }
    };

    const setFrame2 = async (frame: number) => {

        if (frame < 0 || frame >= sequenceUrls.length) {
            return;
        }

        // console.log(" frame:", frame, sequenceUrls.length, sequenceLoading)
        // if (nextFrame == sequenceUrls.length -1 && sequenceLoading) {
        //     sequenceLoading = false
        // }
        if (sequenceLoading) {
            nextFrame = frame;
            return;
        }

        if (frame === sequenceFrame) {
            return;
        }

        // if user changed the scene, confirm
        if (events.invoke('scene.dirty')) {
            const result = await events.invoke('showPopup', {
                type: 'yesno',
                header: 'RESET SCENE',
                message: 'You have unsaved changes. Are you sure you want to reset the scene?'
            });

            if (result.action !== 'yes') {
                return;
            }

            events.fire('scene.clear');
            sequenceSplat = null;
        }
        
        const url = sequenceUrls[frame];
        if (!url) {
            return;
        }
        lastValidUrlInd = frame;
        sequenceLoading = true;

       
        // const newSplat = await events.invoke('single-import', {
        //     filename: 'tmp.ply',
        //     contents: response 
        // }, true) as Splat;
        const newSplat = await events.invoke('single-import', {
            filename: 'tmp.ply',
            url: url 
        }, true) as Splat;

        // wait for first frame render
        const trans:Vec3 = new Vec3(0,1.96,0)
        newSplat.move(trans)
        await firstRender(newSplat);

        // destroy the previous frame
        if (sequenceSplat) {
            sequenceSplat.destroy();
        }
        sequenceFrame = frame;
        sequenceSplat = newSplat;
        sequenceLoading = false;

        // initiate the next frame load
        // console.log("next frame:",nextFrame)
        
        if (nextFrame !== -1) {
            const frame = nextFrame;
            nextFrame = -1;
            setFrame2(frame);
        }
    };

    events.on('plysequence.setFrames', (files: File[]) => {
        setFrames(files);
    });
    // events.on('plysequence.setFrames2', (responses: Response[]) => {
    //     setFrames2(responses);
    // });
    events.on('plysequence.setFrames2', (url: string[]) => {
        setFrames2(url);
    });


    events.on('timeline.frame', async (frame: number) => {
        await setFrame(frame);
    });

    events.on('timeline.frame2', async (frame: number) => {
        await setFrame2(frame);
    });
    events.function("plysequence.lastvalidurl", () =>{
        return [sequenceUrls.filter(f => f !== null).length, lastValidUrlInd];
    })

};

export { registerPlySequenceEvents };
