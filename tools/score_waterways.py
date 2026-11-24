"""Two original instrumental rooms: 钥匙夜巡 and 木桨分水.

Each score has sixteen written bars. In the canal the beat unit is an eighth
note, counted in two groups of three. The prison counts five quarter notes.
"""


SCORES = {
    'prison': (
        55, 'minor', 82, 5, 'lute',
        [0, 3, 5, 4, 0, 6, 3, 4, 5, 2, 3, 4, 0, 5, 4, 0],
        [
            '_/1.5 -3/.5 0/1.5 2/.5 _',       # a footfall, then an upward minor third
            '3/2 _ 2/.5 0/1.5',
            '-2/.75 0/.25 2 _ 5/1.5 3/.5',
            '1/2.5 -1/.5 _/2',
            '0/1.5 _/.5 2 4/.75 3/.25 2',
            '_ 1/.5 2/.5 -1/2 _',
            '3/.75 5/.25 7/1.5 _/.5 5 3',
            '4/2 _/1.5 1/.5 -1',
            '_/.5 5/1.5 7/.5 9/1.5 7',
            '6 4/1.5 2/.5 _/2',
            '3/1.5 5/.5 3/.5 2/.5 0/2',
            '-1/3 _/2',
            '_/.75 -3/.25 0/1.5 2/.5 4 _',
            '5/.5 3/.5 2 0/2 _',
            '1/1.5 4/.5 -1/1.5 _/1.5',
            '0/2.5 _/2.5',
        ],
    ),
    'sewers': (
        64, 'mix', 154, 6, 'flute',
        [0, 6, 3, 0, 5, 3, 1, 4, 3, 0, 6, 4, 5, 3, 4, 0],
        [
            '_ 2 4 5/2 4',                    # anacrusis, long stroke, short lift
            '2/2 1 0/2 _',
            '3/.5 4/.5 5 7 6/1.5 5/.5 3',
            '4/3 _/2 2',
            '5/1.5 6/.5 7 9/2 7',
            '5 _ 3 2/2 0',
            '1/.5 2/.5 3/.5 5/.5 6 5 3 1',
            '4/2.5 2/.5 1 _/2',
            '_/1.5 3/.5 5 7/2 9',
            '11/2 9 7/1.5 4/.5 _',
            '6 7/.5 6/.5 4 2/2 1',
            '-1/3 _ 1 4',
            '5/2 4 2/.5 0/.5 -2/2',
            '3 5/.5 4/.5 3 2/2 0',
            '1 2 4 1/1.5 -1/.5 _',
            '0/3.5 _/2.5',
        ],
    ),
}


def accompany(name, bar, start, chord, meter, tone, tap):
    """Add the room's accompaniment. All positions and durations are in beats."""
    index = bar % 16
    if name == 'prison':
        # One low damped string breaks the silence; its octave speaks a little
        # later, like the body of a double bass. Cadences leave the floor empty.
        bass_at = (0, 2.5, .75, 0)[index % 4]
        if index not in (3, 11, 15):
            tone(start + bass_at, chord - 7, .58, 'lute', .16, -.24)
            tone(start + bass_at + .033, chord - 14, .79, 'felt', .11, -.10)
        if index in (2, 6, 8, 12):
            tone(start + 3.5, chord - 3, .37, 'lute', .078, .08)
        # The warder's iron ring has a short click and two unrelated metallic
        # partials. Only the answer bars get a second, softer key.
        key_at = {1: 1.75, 3: 3.75, 5: 4.25, 7: 2.75, 10: 1.75, 13: 3.25}
        if index in key_at:
            strike = start + key_at[index]
            tap(strike, 'rim', .048)
            tone(strike + .012, 10, .12, 'dulcimer', .055, .56)
            tone(strike + .026, 15, .15, 'water', .021, .68)
            if index in (3, 10):
                tone(strike + .38, 12, .09, 'dulcimer', .026, .39)
        return

    if name == 'sewers':
        # Two strokes to a bar. The left oar enters slightly before the right;
        # chords are broken across the banks rather than struck as a block.
        halfway = meter / 2
        if index not in (3, 11, 15):
            tone(start + .07, chord - 7, 1.2, 'felt', .105, -.46)
            tone(start + halfway + .18, chord - 3, .98, 'lute', .091, .40)
        if index in (2, 4, 6, 9, 12, 14):
            tone(start + 2.35, chord - 5, .39, 'lute', .057, -.22)
        # Isolated droplets answer the flute at varying heights and distances.
        drops = {1: (5.25, 9), 3: (3.45, 7), 5: (2.65, 11), 7: (4.9, 8),
                 10: (5.3, 9), 11: (3.25, 7), 13: (4.65, 11), 15: (4.3, 7)}
        if index in drops:
            offset, pitch = drops[index]
            bank = .61 if index % 3 else -.52
            tone(start + offset, pitch, .27, 'water', .077, bank)
            if index in (3, 7, 11):
                tone(start + offset + .48, pitch - 3, .20, 'water', .039, -bank)
