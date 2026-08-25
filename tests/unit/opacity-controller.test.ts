import { describe, it, expect } from 'vitest';
import { OpacityController } from '../../src/main/state/OpacityController';

// Фикстура-«окно»: собирает все значения прозрачности, которые контроллер применяет.
function createView() {
  const applied: number[] = [];
  return {
    applied,
    setOpacity: (value: number) => {
      applied.push(value);
    },
  };
}

describe('OpacityController', () => {
  it('выставляет стартовую прозрачность в окно при создании', () => {
    const view = createView();
    new OpacityController(view, 0.85);
    expect(view.applied).toEqual([0.85]);
  });

  it('использует 0.85 как стартовую прозрачность по умолчанию', () => {
    const view = createView();
    const controller = new OpacityController(view);
    expect(controller.value).toBe(0.85);
  });

  it('шаг вверх увеличивает прозрачность на 0.1', () => {
    const controller = new OpacityController(createView(), 0.5);
    controller.stepUp();
    expect(controller.value).toBe(0.6);
  });

  it('шаг вниз уменьшает прозрачность на 0.1', () => {
    const controller = new OpacityController(createView(), 0.5);
    controller.stepDown();
    expect(controller.value).toBe(0.4);
  });

  it('не превышает 1.0 при разгоне вверх', () => {
    const controller = new OpacityController(createView(), 0.95);
    controller.stepUp();
    controller.stepUp();
    expect(controller.value).toBe(1);
  });

  it('не опускается ниже 0.2 при разгоне вниз', () => {
    const controller = new OpacityController(createView(), 0.25);
    controller.stepDown();
    controller.stepDown();
    expect(controller.value).toBe(0.2);
  });

  it('клэмпит произвольное значение в допустимый диапазон', () => {
    const view = createView();
    const controller = new OpacityController(view);
    controller.set(42);
    expect(controller.value).toBe(1);
    controller.set(-3);
    expect(controller.value).toBe(0.2);
  });

  it('не плодит артефакты плавающей точки при шагах', () => {
    const controller = new OpacityController(createView(), 0.85);
    controller.stepUp();
    expect(controller.value).toBe(0.95);
  });

  it('применяет каждое изменение в окно', () => {
    const view = createView();
    const controller = new OpacityController(view, 0.5);
    controller.stepDown();
    controller.set(1);
    expect(view.applied).toEqual([0.5, 0.4, 1]);
  });
});
